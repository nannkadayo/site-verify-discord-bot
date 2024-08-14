const { Client, Events, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const signale = require('signale');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const config = require('../verify.config');
const app = express();
app.use(express.json());

// データベースを開く関数
function openDatabase(dbFilePath) {
    const db = new sqlite3.Database(dbFilePath, (err) => {
        if (err) {
            signale.error("データベースを開けませんでした: " + err.message);
        } else {
            signale.success("データベースが正常に開かれました: " + dbFilePath);
        }
    });

    // テーブルが存在しない場合は作成する
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS panels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT,
                guild_id TEXT
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS verifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT,
                user_id TEXT,
                verify_id TEXT,
                ip_address TEXT,
                fingerprint TEXT
            )
        `);
        db.run(`
           CREATE TABLE IF NOT EXISTS pending_requests (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               verify_id TEXT NOT NULL UNIQUE,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
           )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS panel_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT UNIQUE,
                role_id TEXT
            );
        `);
       // db.run(`
      //      ALTER TABLE verifications ADD COLUMN is_valid BOOLEAN DEFAULT TRUE;
     //   `);
      // カラムが存在するかを確認して、存在しない場合のみカラムを追加
    db.get(`PRAGMA table_info(verifications)`, (err, row) => {
        if (err) {
            console.error(err.message);
            return;
        }

        // PRAGMA table_infoは複数の行を返すので、すべてのカラムを確認
        const columns = [];
        db.all(`PRAGMA table_info(verifications)`, (err, rows) => {
            if (err) {
                console.error(err.message);
                return;
            }

            rows.forEach((column) => {
                columns.push(column.name);
            });

            // "is_valid" カラムが存在しない場合にのみ追加
            if (!columns.includes('is_valid')) {
                db.run(`
                    ALTER TABLE verifications ADD COLUMN is_valid BOOLEAN DEFAULT TRUE
                `, (err) => {
                    if (err) {
                       signale.error('Failed to add column:', err.message);
                    } else {
                        signale.success('Column is_valid added successfully');
                    }
                });
            } else {
                signale.note('Column is_valid already exists');
            }
        });
    });
    });

    return db;
}

// クエリを実行する
function runQuery(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                reject(err.message);
            } else {
                resolve(this);
            }
        });
    });
}

// データを取得する（単一行）
function getQuery(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err.message);
            } else {
                resolve(row);
            }
        });
    });
}

// データを取得する（複数行）
function allQuery(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err.message);
            } else {
                resolve(rows);
            }
        });
    });
}

// IDを生成する
function generateId() {
    let key = '';
    const length = 15;
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
        key += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return key;
}

// データベースを開く
const db = openDatabase("data.db");

// Discordクライアントを作成
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const startTime = performance.now();
signale.start('起動を開始しました');

client.on('ready', async () => {
    await client.application.commands
        .set([
            new SlashCommandBuilder()
                .setName('panel')
                .setDescription("認証パネルの設置")
                .addRoleOption(option => 
                    option.setName('role')
                    .setDescription('付与するロール')
                    .setRequired(true))
        ].map((command) => command.toJSON()))
        .then(() => signale.await('スラッシュコマンド登録中...'));

    signale.success('スラッシュコマンド登録完了。');
    const endTime = performance.now();
    signale.success(`Botの起動が完了しました。${client.user.tag}でログイン中`);
    let time = endTime - startTime;
    signale.note('起動時間' + time);
});

client.on(Events.InteractionCreate, async interaction => {
    const username = interaction.user.username;
    if (interaction.commandName === 'panel') {
        const role = interaction.options.getRole('role');

        const cancel = new ButtonBuilder()
            .setCustomId('verify')
            .setLabel('認証')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder()
            .addComponents(cancel);

        const embed = new EmbedBuilder()
            .setTitle('認証')
            .setFields({ name: "サーバー認証", value: 'サイトにアクセスして認証' })
            .setColor(0x0f8cd9)

        const message = await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '認証パネルが作成されました', ephemeral: true });

        // メッセージID、ギルドID、ロールIDをデータベースに保存
        await runQuery(db, `INSERT INTO panels (message_id, guild_id) VALUES (?, ?)`, [message.id, interaction.guild.id]);

        // ロールIDをデータベースに保存
        await runQuery(db, `INSERT OR REPLACE INTO panel_settings (guild_id, role_id) VALUES (?, ?)`, [interaction.guild.id, role.id]);

    } else if (interaction.isButton()) {
        const { customId } = interaction;

        if (customId === "verify") {
            // verifyIdを生成
            const verifyId = generateId();

            // メッセージID、ユーザーID、verifyIdをデータベースに保存
            await runQuery(db, `INSERT INTO verifications (message_id, user_id, verify_id) VALUES (?, ?, ?)`, [interaction.message.id, interaction.user.id, verifyId]);
            const cancel = new ButtonBuilder()
            
            .setLabel('認証を続ける')
            .setStyle(ButtonStyle.Link)
            .setURL(config.verify.url+"/verify/"+ verifyId);
        const row = new ActionRowBuilder()
            .addComponents(cancel);

            const embed = new EmbedBuilder()
                .setTitle("サイト認証")
                .setFields({ name: '表示', value: `URLにアクセスし認証を完了します` })
                .setColor(0x0f8cd9)
                .setTimestamp()
                .setFooter({ text: username, iconURL: interaction.member.user.avatarURL() });

            await interaction.reply({ embeds: [embed], ephemeral: true , components: [row] });
        }
    }
});
client.login(config.verify.token);

app.post('/assign-role', async (req, res) => {
    const { discordUserId, messageId } = req.body;

    if (!discordUserId || !messageId) {
        return res.status(400).json({ success: false, error: 'No Discord user ID or message ID provided' });
    }

    try {
        // messageId に対応するギルドIDを取得
        const panelData = await getQuery(db, 'SELECT guild_id FROM panels WHERE message_id = ?', [messageId]);
        const guildId = panelData ? panelData.guild_id : null;

        if (!guildId) {
            return res.status(404).json({ success: false, error: 'Guild not found for the provided message ID' });
        }

        const guild = client.guilds.cache.get(guildId); 
        const member = await guild.members.fetch(discordUserId);

        if (member) {
            // guildId に対応するロールIDを取得
            const settings = await getQuery(db, 'SELECT role_id FROM panel_settings WHERE guild_id = ?', [guildId]);
            const roleId = settings ? settings.role_id : null;

            if (roleId) {
                const role = guild.roles.cache.get(roleId);
                if (role) {
                    await member.roles.add(role);

                    const embed = new EmbedBuilder()
                        .setTitle('認証')
                        .setFields({ name: "サーバー認証", value: '認証が完了しました。' })
                        .setColor(0x92c592)
                        .setTimestamp()
                        .setFooter({ text: guild.name, iconURL: guild.iconURL() });

                    await member.send({ embeds: [embed] });
                    return res.json({ success: true });
                }
            }

            return res.status(404).json({ success: false, error: 'Role not found' });
        } else {
            return res.status(404).json({ success: false, error: 'Member not found' });
        }
    } catch (error) {
        console.error('Error assigning role:', error);
        return res.status(500).json({ success: false, error: 'Failed to assign role' });
    }
});

app.listen(config.verify.apiport, () => {
    signale.success(`Bot server running on port`+config.verify.apiport);
});
