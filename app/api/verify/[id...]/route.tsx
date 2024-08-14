import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import path from 'path';
import dns from 'dns';

// データベースのファイルパスを指定
const dbFilePath = path.join(process.cwd(), 'data.db');

// データベースを開く関数
function openDatabase() {
    const db = new sqlite3.Database(dbFilePath, (err) => {
        if (err) {
            console.error("データベースを開けませんでした: " + err.message);
        }
    });
    return db;
}

// テーブルにip_addressカラムとfingerprintカラムが存在するかチェックし、存在しない場合は追加する関数
async function ensureColumns() {
    const db = openDatabase();
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(verifications);`, [], (err, columns) => {
            if (err) {
                reject(err.message);
            } else {
                const hasIpAddressColumn = columns.some((column) => column.name === 'ip_address');
                const hasFingerprintColumn = columns.some((column) => column.name === 'fingerprint');
                
                let promises = [];
                if (!hasIpAddressColumn) {
                    promises.push(new Promise((resolve, reject) => {
                        db.run('ALTER TABLE verifications ADD COLUMN ip_address TEXT', (alterErr) => {
                            if (alterErr) {
                                reject(alterErr.message);
                            } else {
                                resolve();
                            }
                        });
                    }));
                }
                if (!hasFingerprintColumn) {
                    promises.push(new Promise((resolve, reject) => {
                        db.run('ALTER TABLE verifications ADD COLUMN fingerprint TEXT', (alterErr) => {
                            if (alterErr) {
                                reject(alterErr.message);
                            } else {
                                resolve();
                            }
                        });
                    }));
                }

                Promise.all(promises).then(resolve).catch(reject);
            }
        });
    });
}

// 同じIPアドレス、メッセージID、およびfingerprintの組み合わせが存在するかを確認する関数
async function isDuplicateVerification(ip: string, messageId: string, fingerprint: string) {
    const db = openDatabase();
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM verifications WHERE ip_address = ? AND message_id = ? AND fingerprint = ?',
            [ip, messageId, fingerprint],
            (err, row) => {
                if (err) {
                    reject(err.message);
                } else {
                    resolve(row);
                }
            }
        );
    });
}

// ペンディングリクエストの確認・作成関数
async function handlePendingRequest(id: string) {
    const db = openDatabase();
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM pending_requests WHERE verify_id = ?', [id], (err, row) => {
            if (err) {
                reject(err.message);
            } else if (row) {
                resolve(true);
            } else {
                db.run('INSERT INTO pending_requests (verify_id) VALUES (?)', [id], (insertErr) => {
                    if (insertErr) {
                        reject(insertErr.message);
                    } else {
                        resolve(false);
                    }
                });
            }
        });
    });
}

// IDの検証関数
async function verifyId(id: string) {
    const db = openDatabase();
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM verifications WHERE verify_id = ? AND is_valid = TRUE', [id], (err, row) => {
            if (err) {
                reject(err.message);
            } else {
                resolve(row);
            }
        });
    });
}

// IDの無効化関数
async function invalidateId(id: string) {
    const db = openDatabase();
    return new Promise((resolve, reject) => {
        db.run('UPDATE verifications SET is_valid = FALSE WHERE verify_id = ?', [id], (err) => {
            if (err) {
                reject(err.message);
            } else {
                resolve();
            }
        });
    });
}

// 逆DNSルックアップを実行して、プロキシ、VPN、TORの兆候をチェックする関数
async function reverseDNS(ip: string): Promise<string[]> {
    return new Promise((resolve) => {
        dns.reverse(ip, (err, hostnames) => {
            if (err) {
                console.log(`IP ${ip} の逆DNSルックアップに失敗しました: ${err.message}`);
                resolve([]);
                return;
            }

            const suspiciousHostnames = hostnames.filter(hostname =>
                hostname.includes('proxy') ||
                hostname.includes('vpn') ||
                hostname.includes('tor')
            );

            resolve(suspiciousHostnames);
        });
    });
}

// プロキシ、VPN、TORの検出を行う関数
async function detectProxyVPN(req): Promise<boolean> {
    // IPv4アドレスの取得
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.connection.remoteAddress;
    if (!ip || !isValidIPv4(ip)) {
        return false;
    }

    // プロキシの兆候をチェック
    const proxyIndicators = [];
    if (req.headers.get('x-forwarded-for')) {
        proxyIndicators.push('X-Forwarded-For ヘッダーが検出されました');
    }
    if (req.headers.get('via')) {
        proxyIndicators.push('Via ヘッダーが検出されました');
    }
    if (req.headers.get('forwarded')) {
        proxyIndicators.push('Forwarded ヘッダーが検出されました');
    }

    // 逆DNSルックアップの結果を取得
    const suspiciousHostnames = await reverseDNS(ip);

    // プロキシやVPNの兆候が見つかった場合、アクセスをブロック
    if (proxyIndicators.length > 0 || suspiciousHostnames.length > 0) {
        return true;
    }
    return false;
}

// IPv4アドレスのバリデーション関数
function isValidIPv4(ip: string): boolean {
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
}
// PUTリクエストハンドラ
export async function PUT(request: Request) {
    try {
        const { id, fingerprint, ipAddress } = await request.json();
        const ip = request.headers.get('x-forwarded-for') || request.connection.remoteAddress;

        // IPアドレスの確認
        if (!ip || !ipAddress) {
            return NextResponse.json({ success: false, errorCode: 'IP_MISSMATCH' });
        }

    
        
        if (!id) {
            return NextResponse.json({ success: false, errorCode: 'INVALID_ID' });
        }

        // ip_addressカラムとfingerprintカラムの存在を確認し、必要に応じて追加
        await ensureColumns();

        // IDを検証し、messageId を取得
        const result = await verifyId(id);

        if (!result) {
            return NextResponse.json({ success: false, errorCode: 'ID_NOT_FOUND' });
        }

        const messageId = result.message_id;

        // ペンディングリクエストの確認・作成
        const isPending = await handlePendingRequest(id);

        // 同じIPアドレス、メッセージID、およびfingerprintの組み合わせが既に存在するかを確認
      
      

        if (!isPending) {
            return NextResponse.json({ success: false, errorCode: 'pending' });
        }

        // 2回目のリクエストでのみ本格的な処理を実行
        await invalidateId(id);
        const isDuplicate = await isDuplicateVerification(ip, messageId, fingerprint);
        if (isDuplicate) {
            return NextResponse.json({ success: false, errorCode: 'DUPLICATE_VERIFICATION' });
        }
        const isProxyVPNDetected = await detectProxyVPN(request);
        if (isProxyVPNDetected) {
            return NextResponse.json({ success: false, errorCode: 'PROXY_VPN_DETECTED' });
        }
        // 認証成功の時、user_idとip_addressをボットに通知
        const discordUserId = result.user_id;
       
        await fetch('http://localhost:8018/assign-role', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ discordUserId, ip, messageId }),
        });

        // IPアドレス、メッセージID、fingerprintをverificationsテーブルに保存
        const db = openDatabase();
        db.run('UPDATE verifications SET ip_address = ?, fingerprint = ? WHERE verify_id = ?', [ip, fingerprint, id]);

        return NextResponse.json({ success: true, data: result });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ success: false, errorCode: 'SERVER_ERROR' });
    }
}
