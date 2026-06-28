import React, { useState, useRef, useEffect } from 'react';

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
  const [isListening, setIsListening] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const activeSegmentStartRef = useRef<number>(0);

  // 動画ファイルが選択されたとき
  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setSubtitles([]); 
      setCurrentText('');
      setStatusMessage('💡 「テロップ聞き取り開始」を押してから動画を再生してください。');
    }
  };

  // 🎤 ブラウザ標準の音声認識を初期化・コントロールする関数
  const toggleListening = () => {
    if (isListening) {
      // 停止処理
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (videoRef.current) {
        videoRef.current.pause();
      }
      setIsListening(false);
      setStatusMessage('⏸️ 聞き取りを一時停止しました。内容を編集できます。');
      return;
    }

    // 音声認識エンジンの準備（Safari、Chrome両対応）
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setStatusMessage('❌ お使いのブラウザは標準音声認識に対応していません。最新のSafariまたはChromeでお試しください。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;       // 途切れても continuous（連続）で聴く
    recognition.interimResults = true;    // 話している途中の経過も表示する
    recognition.lang = 'ja-JP';           // 日本語に固定

    recognition.onstart = () => {
      setIsListening(true);
      setStatusMessage('🎙️ 聞き取り中... 動画を再生してください。（スピーカーの音を大きめにするか、マイクに近づけると効果的です）');
      if (videoRef.current) {
        activeSegmentStartRef.current = videoRef.current.currentTime;
        videoRef.current.play(); // 音声認識スタートと同時に動画も再生
      }
    };

    recognition.onresult = (event: any) => {
      if (!videoRef.current) return;
      
      const currentTime = videoRef.current.currentTime;
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      // 話している最中の文字を画面にリアルタイム表示
      if (interimTranscript) {
        setCurrentText(interimTranscript);
      }

      // 確定した文章をテロップリストに登録
      if (finalTranscript.trim()) {
        const endTime = currentTime;
        const startTime = activeSegmentStartRef.current;

        // あまりにも短いセグメントを防止（最低でも0.5秒）
        const actualStart = endTime - startTime > 0.5 ? startTime : Math.max(0, endTime - 2);

        setSubtitles((prev) => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            start: actualStart,
            end: endTime,
            text: finalTranscript.trim()
          }
        ]);

        // 次の文字のために開始時間を更新
        activeSegmentStartRef.current = currentTime;
        setCurrentText('');
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      if (event.error === 'not-allowed') {
        setStatusMessage('❌ マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。');
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // 動画がまだ再生中なら、自動で音声認識を再起動して途切れないようにする
      if (isListening && videoRef.current && !videoRef.current.paused && !videoRef.current.ended) {
        try { recognition.start(); } catch (e) {}
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // 再生時間の監視タイマー（作成済みのテロップを動画に合わせて表示する）
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const intervalCheck = () => {
      // 聞き取りモード中（isListening = true）は、onresult側のリアルタイム表示を優先する
      if (isListening) return; 

      if (subtitles.length === 0) return;
      const currentTime = video.currentTime;
      const activeSubtitle = subtitles.find(
        (sub) => currentTime >= sub.start && currentTime <= sub.end
      );
      setCurrentText(activeSubtitle ? activeSubtitle.text : '');
    };

    const timerId = setInterval(intervalCheck, 100);
    return () => clearInterval(timerId);
  }, [subtitles, isListening]);

  const handleTextChange = (id: number, newText: string) => {
    setSubtitles((prev) =>
      prev.map((sub) => (sub.id === id ? { ...sub, text: newText } : sub))
    );
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '30px', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>🎥 高精度・無料自動テロップ生成アプリ</h1>
        <p style={{ color: '#666', fontSize: '14px' }}>端末標準の安全な音声認識システムを使い、ズレのない快適な文字起こしを行います。</p>
      </header>
      
      <div style={{ marginBottom: '20px', backgroundColor: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <input type="file" accept="video/*" onChange={handleVideoChange} />
        {videoSrc && (
          <button 
            onClick={toggleListening} 
            style={{
              marginLeft: '15px',
              padding: '8px 16px',
              backgroundColor: isListening ? '#ff3b30' : '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {isListening ? '⏸️ 聞き取りを一時停止' : '✨ テロップ聞き取り開始'}
          </button>
        )}
        {statusMessage && (
          <div style={{ marginTop: '10px', color: '#333', fontSize: '14px', fontWeight: 'bold', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '4px', borderLeft: '4px solid #0071e3' }}>
            {statusMessage}
          </div>
        )}
      </div>

      {videoSrc && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>プレビュー</h3>
            <div style={{ position: 'relative', width: '100%', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }}>
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                playsInline
                style={{ width: '100%', display: 'block' }}
              />
              {currentText && (
                <div style={{
                  position: 'absolute',
                  bottom: '60px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(0, 0, 0, 0.85)',
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  fontSize: '20px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  maxWidth: '85%',
                  wordBreak: 'break-word',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                  zIndex: 99,
                  pointerEvents: 'none'
                }}>
                  {currentText}
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>📝 自動生成されたテロップ（修正可能）</h3>
            {subtitles.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', backgroundColor: '#fff', borderRadius: '8px', color: '#888', border: '1px dashed #ccc' }}>
                「テロップ聞き取り開始」を押して動画を流すと、ここに綺麗な字幕がリアルタイムでどんどん追加されます！
              </div>
            ) : (
              <div style={{ maxHeight: '450px', overflowY: 'auto', backgroundColor: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                {subtitles.map((sub) => (
                  <div key={sub.id} style={{ marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ fontSize: '12px', color: '#28a745', fontWeight: 'bold', marginBottom: '6px' }}>
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
