"use client"; // クライアントコンポーネントとして指定

import { useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

type VerifyProps = {
  params: {
    id: string[];
  };
};

export default function VerifyPage({ params }: VerifyProps) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true); // ローディング状態
  const fullId = params.id.join('/');

  useEffect(() => {
    async function verifyId() {
      setLoading(true); // APIリクエスト開始時にローディングを表示

      try {
        // フィンガープリントを取得
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        const fingerprint = result.visitorId;

        // IPアドレスを外部サービスから取得（例としてipifyを使用）
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        const ipAddress = ipData.ip;

        const response = await fetch(`/api/verify/${fullId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: fullId,
            fingerprint,
            ipAddress,
          }),
        });

        const data = await response.json();

        if (data.success) {
          setResult('success'); // 成功時の結果を'success'に設定
        }else if(data.errorCode == "pending"){
          setResult(`pending`);
        } 
        else {
          setResult(`Error: ${data.errorCode}`);
        }
      } catch (error) {
        setResult('Error: API_REQUEST_FAILED');
      } finally {
        setLoading(false); // APIリクエスト完了時にローディングを終了
      }
    }

    verifyId();
  }, [fullId]);

  if (!fullId) {
    notFound();
  }

  return (
    <div className="page-container">
    {loading ? (
      <div className="loading-overlay">
        <div className="spinner">
          <div className="double-bounce1"></div>
          <div className="double-bounce2"></div>
        </div>
      </div>
    ) : result === 'success' ? ( // 成功時の緑色チェックマーク
      <div className="result-container">
        <div className="result-icon success-icon">✅</div>
        <h1>認証完了</h1>
        <p>認証が正常に完了しました！</p>
      </div>
    ) : result === 'pending' ? ( // ペンディング状態の処理
      <div className="result-container">
        <div className="result-icon pending-icon">⏳</div>
        <h1>認証処理中</h1>
        <p>認証処理が保留中です。しばらくお待ちください。</p>
      </div>
    ) : ( // 失敗時の赤色バツマーク
      <div className="result-container">
        <div className="result-icon error-icon">❌</div>
        <h1>認証失敗</h1>
        <p>{result}</p>
      </div>
    )}
      <style jsx>{`
        .page-container {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          font-family: Arial, sans-serif;
        }
        .loading-overlay {
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .spinner {
          width: 40px;
          height: 40px;
          position: relative;
        }
        .double-bounce1, .double-bounce2 {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background-color: #92c592;
          opacity: 0.6;
          position: absolute;
          top: 0;
          left: 0;
          animation: bounce 2.0s infinite ease-in-out;
        }
        .double-bounce2 {
          animation-delay: -1.0s;
        }
        @keyframes bounce {
          0%, 100% {
            transform: scale(0.0);
          } 50% {
            transform: scale(1.0);
          }
        }
        .result-container {
          text-align: center;
        }
        .result-icon {
          font-size: 4rem;
        }
        .success-icon {
          color: #92c592;
        }
        .error-icon {
          color: #e74c3c;
        }
        h1 {
          font-size: 2rem;
        }
        p {
          font-size: 1.2rem;
          color: #333;
        }
      `}</style>
    </div>
  );
}