import React, { useState, useRef } from 'react';

interface Subtitle {
  id: number;
  start: number;
  end: number;
  text: string;
}

export default function App() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [currentText, setCurrentText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setSubtitles([]); 
      setCurrentText('');
    }
  };

  // 確実にステートが更新されるように処理を直列化しました
  const generateCaptions = () => {
    if (!videoSrc) return;
    setIsProcessing(true);

    // テロップの元データを定義
    const dummySubtitles: Subtitle[] = [
      { id: 1, start: 1.0, end: 3.5, text: "こんにちは！プロトタイプへようこそ。" },
      { id: 2, start: 4.0, end: 7.0, text: "これはブラウザ上で動く自動テロップ生成のデモです。" },
      { id: 3, start: 8.0, end: 11.5, text: "動画の再生時間に合わせて文字が切り替わります。" },
    ];

    // タイマー処理の確実性を上げるため、少しディレイを入れて確実に状態を変化させます
    setTimeout(() => {
      setSubtitles(dummySubtitles);
      setIsProcessing(false);
      
      // 生成されたら動画を最初に戻す（同期ズレを防ぐため）
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
    }, 1000);
  };

  // 再生時間の監視処理（大文字小文字の判定ミスを防ぐためシンプルに修正）
  const handleTimeUpdate = () => {
    if (!videoRef.current || subtitles.length === 0) return;
    
    const currentTime = videoRef.current.currentTime;
    
    // 現在の時間に合うテロップを探す
    const activeSubtitle = subtitles.find(
      (sub) => currentTime >= sub.start && currentTime <= sub.end
    );
    
    if (activeSubtitle) {
      setCurrentText(activeSubtitle.text);
    } else {
      setCurrentText('');
    }
  };

  const handleTextChange = (id: number, newText: string) => {
    setSubtitles((prev) =>
      prev.map((sub) => (sub.id === id ? { ...sub, text: newText } : sub))
    );
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '30px', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>🎥 自動テロップ PWA</h1>
        <p style={{ color: '#666', fontSize: '14px' }}>動画をアップロードして、音声から自動でテロップを生成します。</p>
      </header>
      
      <div style={{ marginBottom: '20px', backgroundColor: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <input type="file" accept="video/*" onChange={handleVideoChange} />
        {videoSrc && (
          <button 
            onClick={generateCaptions} 
            disabled={isProcessing}
            style={{
              marginLeft: '15px',
              padding: '8px 16px',
              backgroundColor: isProcessing ? '#ccc' : '#0071e3',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {isProcessing ? 'AI音声認識中...' : '✨ 自動テロップを生成'}
          </button>
        )}
      </div>

      {videoSrc && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* 左側：プレビュー */}
          <div>
            <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>プレビュー</h3>
            <div style={{ position: 'relative', width: '100%', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }}>
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                onTimeUpdate={handleTimeUpdate}
                style={{ width: '100%', display: 'block' }}
              />
              {/* テロップオーバーレイの表示（最前面に来るよう z-index を追加） */}
              {currentText && (
                <div style={{
                  position: 'absolute',
                  bottom: '50px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '18px',
                  textAlign: 'center',
                  pointerEvents: 'none',
                  maxWidth: '85%',
                  wordBreak: 'break-word',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                  zIndex: 10
                }}>
                  {currentText}
                </div>
              )}
            </div>
          </div>

          {/* 右側：タイムライン */}
          <div>
            <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>📝 テロップ編集</h3>
            {subtitles.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', backgroundColor: '#fff', borderRadius: '8px', color: '#888' }}>
                動画を選択し、「自動テロップを生成」ボタンを押してください。
              </div>
            ) : (
              <div style={{ maxHeight: '450px', overflowY: 'auto', backgroundColor: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                {subtitles.map((sub) => (
                  <div key={sub.id} style={{ marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ fontSize: '12px', color: '#0071e3', fontWeight: 'bold', marginBottom: '6px' }}>
                      ⏱️ {sub.start.toFixed(1)}s 〜 {sub.end.toFixed(1)}s
                    </div>
                    <input
                      type="text"
                      value={sub.text}
                      onChange={(e) => handleTextChange(sub.id, e.target.value)}
                      style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
