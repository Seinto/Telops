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
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const activeStartRef = useRef<number>(0);

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setSubtitles([]);
      setCurrentText('');
      setStatusMessage('💡 動画が読み込まれました。「✨ 超高精度テロップを自動生成」を押してください。');
    }
  };

  // 🗣️ 完全自動で動画から音声を吸い上げてテロップを並べる処理
  const startAutoTranscription = () => {
    const targetWindow = window as any;
    const SpeechRecognition = targetWindow.SpeechRecognition || targetWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setStatusMessage('❌ お使いのブラウザは音声認識に対応していません。最新のSafari等でお試しください。');
      return;
    }

    if (!videoRef.current) return;

    setIsProcessing(true);
    setSubtitles([]);
    setStatusMessage('⏳ 音声認識システムを起動中...（まもなく自動で文字起こしが始まります）');

    // 動画を最初に戻し、音を出した状態で裏で再生
    videoRef.current.currentTime = 0;
    videoRef.current.muted = false;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ja-JP';

    activeStartRef.current = 0;

    recognition.onstart = () => {
      setStatusMessage('🗣️ 動画を解析中... お子様の言葉を検出して自動でテロップを生成しています。そのままお待ちください。');
      if (videoRef.current) {
        videoRef.current.play().catch(() => {
          setStatusMessage('💡 画面を一度タップするか、動画の再生ボタン（▶）を押して解析を開始してください。');
        });
      }
    };

    recognition.onresult = (event: any) => {
      if (!videoRef.current) return;

      const currentTime = videoRef.current.currentTime;
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const textToShow = finalTranscript || interimTranscript;

      if (textToShow.trim()) {
        const endTime = currentTime + 1.2;
        setSubtitles((prev) => {
          const lastSub = prev[prev.length - 1];
          // 同じ区間内の連続した言葉であれば上書き更新して文字を繋げる
          if (lastSub && Math.abs(lastSub.start - activeStartRef.current) < 0.6) {
            return prev.map((s, idx) => idx === prev.length - 1 ? { ...s, text: textToShow, end: endTime } : s);
          } else {
            // 新しい発言を検出したらタイムラインに追加
            return [...prev, {
              id: Date.now() + Math.random(),
              start: activeStartRef.current,
              end: endTime,
              text: textToShow
            }];
          }
        });
      }

      if (finalTranscript) {
        activeStartRef.current = videoRef.current.currentTime;
      }
    };

    recognition.onend = () => {
      // 動画がまだ最後までいっていない場合は自動で認識を再開
      if (videoRef.current && !videoRef.current.paused && videoRef.current.currentTime < videoRef.current.duration - 0.5) {
        recognition.start();
      } else {
        setIsProcessing(false);
        setStatusMessage('🎉 全自動テロップ生成が完了しました！右側の一覧から自由に文字を修正・編集できます。');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // 動画の再生が終わったら自動的に終了する監視処理
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVideoEnd = () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };

    video.addEventListener('ended', handleVideoEnd);
    return () => video.removeEventListener('ended', handleVideoEnd);
  }, []);

  // テロップの画面表示連動処理
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const intervalCheck = () => {
      if (subtitles.length === 0) return;
      const currentTime = video.currentTime;
      const activeSubtitle = subtitles.find(
        (sub) => currentTime >= sub.start && currentTime <= sub.end
      );
      setCurrentText(activeSubtitle ? activeSubtitle.text : '');
    };

    const timerId = setInterval(intervalCheck, 100);
    return () => clearInterval(timerId);
  }, [subtitles]);

  const handleTextChange = (id: number, newText: string) => {
    setSubtitles((prev) =>
      prev.map((sub) => (sub.id === id ? { ...sub, text: newText } : sub))
    );
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f5f7fa', minHeight: '100vh' }}>
      <header style={{ marginBottom: '25px', backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h1 style={{ fontSize: '24px', margin: '0 0 5px 0', color: '#1d1d1f' }}>🎥 お子様動画専用・自動テロップ編集アプリ</h1>
        <p style={{ color: '#86868b', fontSize: '14px', margin: 0 }}>動画を選ぶだけで、ズレのないテロップを完全自動で生成します。</p>
      </header>
      
      <div style={{ marginBottom: '25px', backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <input type="file" accept="video/*" onChange={handleVideoChange} style={{ fontSize: '15px' }} />
        {videoSrc && (
          <button 
            onClick={startAutoTranscription} 
            disabled={isProcessing}
            style={{
              marginLeft: '15px',
              padding: '10px 20px',
              backgroundColor: isProcessing ? '#ccc' : '#0071e3',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            {isProcessing ? '⏳ 自動解析中...' : '✨ 超高精度テロップを自動生成'}
          </button>
        )}

        {statusMessage && (
          <div style={{ marginTop: '15px', color: '#1d1d1f', fontSize: '14px', fontWeight: '500', backgroundColor: '#f2f2f7', padding: '12px 16px', borderRadius: '8px', borderLeft: '4px solid #0071e3' }}>
            {statusMessage}
          </div>
        )}
      </div>

      {videoSrc && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '25px' }}>
          <div>
            <h3 style={{ fontSize: '16px', marginBottom: '12px', color: '#1d1d1f' }}>📺 プレビュー画面</h3>
            <div style={{ position: 'relative', width: '100%', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
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
                  bottom: '65px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  color: '#fff',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontSize: '20px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  maxWidth: '85%',
                  wordBreak: 'break-word',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                  zIndex: 99,
                  pointerEvents: 'none',
                  border: '1px solid rgba(255,255,255,0.2)'
                }}>
                  {currentText}
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '16px', marginBottom: '12px', color: '#1d1d1f' }}>📝 自動生成されたテロップタイムライン</h3>
            <div style={{ maxHeight: '500px', overflowY: 'auto', backgroundColor: '#fff', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e5e5ea' }}>
              {subtitles.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#86868b', fontSize: '14px' }}>
                  「✨ 超高精度テロップを自動生成」ボタンを押すと、動画内の声が自動でここにテキスト化されます。
                </div>
              ) : (
                subtitles.map((sub) => (
                  <div key={sub.id} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #f2f2f7' }}>
                    <div style={{ fontSize: '12px', color: '#0071e3', fontWeight: 'bold', marginBottom: '6px' }}>
                      ⏱️ {sub.start.toFixed(1)}秒 〜 {sub.end.toFixed(1)}秒
                    </div>
                    <input
                      type="text"
                      value={sub.text}
                      onChange={(e) => handleTextChange(sub.id, e.target.value)}
                      style={{ 
                        width: '100%', 
                        padding: '10px', 
                        fontSize: '14px', 
                        borderRadius: '8px', 
                        border: '1px solid #d1d1d6', 
                        boxSizing: 'border-box',
                        backgroundColor: '#fff'
                      }}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
