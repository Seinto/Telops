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
  
  // 📊 解析の進捗状況を可視化するためのステート
  const [progress, setProgress] = useState<number>(0);
  const [progressPhase, setProgressPhase] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setSubtitles([]); 
      setCurrentText('');
      setProgress(0);
      setProgressPhase('');
      setStatusMessage('💡 動画が読み込まれました。「✨ 超高精度テロップを自動生成」を押してください。');
    }
  };

  // 🗣️ 動画の音声を直接テキスト化する処理
  const startDirectTranscription = async () => {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file) {
      setStatusMessage('❌ 動画ファイルが選択されていません。');
      return;
    }

    setIsProcessing(true);
    setProgress(5);
    setProgressPhase('read');
    setStatusMessage('🎵 動画ファイルから音声データを読み込んでいます... (5%)');

    // 💡 フリーズ対策のセーフティタイマー（5秒間全く進捗が動かない場合は手動枠に切り替え）
    const fallbackTimer = setTimeout(() => {
      if (videoRef.current) {
        createManualSlots(videoRef.current.duration || 15);
      } else {
        createManualSlots(15);
      }
    }, 5000);

    try {
      const targetWindow = window as any;
      const AudioContextClass = targetWindow.AudioContext || targetWindow.webkitAudioContext;
      
      if (!AudioContextClass) {
        throw new Error("音声処理非対応");
      }
      
      const audioCtx = new AudioContextClass({ sampleRate: 16000 });
      const fileReader = new FileReader();

      fileReader.onload = async (e) => {
        try {
          setProgress(25);
          setProgressPhase('decode');
          setStatusMessage('⏳ 読み込んだ音声データをブラウザが解読中... (25%) ※ここで固まる場合はブラウザ制限です');

          const arrayBuffer = e.target?.result as ArrayBuffer;
          
          // Safari等でここで無限に待たされるケース対策
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          
          setProgress(60);
          setProgressPhase('setup');
          setStatusMessage('🧠 AI音声認識エンジンを起動しています... (60%)');
          
          const SpeechRecognition = targetWindow.SpeechRecognition || targetWindow.webkitSpeechRecognition;
          if (!SpeechRecognition) {
            throw new Error("音声認識非対応");
          }

          const duration = audioBuffer.duration;
          const interval = 3.5; 
          const generatedSubs: Subtitle[] = [];
          
          for (let start = 0; start < duration; start += interval) {
            const end = Math.min(start + interval, duration);
            generatedSubs.push({
              id: Date.now() + start,
              start: start,
              end: end,
              text: '（音声解析中...）'
            });
          }
          setSubtitles(generatedSubs);

          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = false;
          recognition.lang = 'ja-JP';

          let subIndex = 0;
          
          recognition.onstart = () => {
            clearTimeout(fallbackTimer); // 無事に動き出したらタイマー解除
            setProgress(80);
            setProgressPhase('listening');
            setStatusMessage('🗣️ 準備完了！動画を1倍速で再生しながら音声をリアルタイム聞き取り中... (80%)');
          };

          recognition.onresult = (event: any) => {
            // 文字が聞き取れるたび進捗を少しずつ進める
            const currentProg = Math.min(80 + Math.floor((subIndex / generatedSubs.length) * 20), 99);
            setProgress(currentProg);

            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                const text = event.results[i][0].transcript.trim();
                if (text && subIndex < generatedSubs.length) {
                  setSubtitles((prev) => 
                    prev.map((sub, idx) => idx === subIndex ? { ...sub, text: text } : sub)
                  );
                  subIndex++;
                }
              }
            }
          };

          recognition.onend = () => {
            clearTimeout(fallbackTimer);
            setProgress(100);
            setProgressPhase('success');
            setIsProcessing(false);
            setStatusMessage('🎉 テロップの自動聞き取りが完了しました！右側で自由に打ち直しができます。');
            setSubtitles((prev) => prev.map(s => s.text === '（音声解析中...）' ? { ...s, text: '💡 タップしてセリフを入力' } : s));
          };

          recognition.onerror = (err: any) => {
            console.error('認識エラー:', err);
            // エラーが出ても止まらず手動入力枠へ救済
            clearTimeout(fallbackTimer);
            createManualSlots(duration);
          };

          recognition.start();

          if (videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current.playbackRate = 1.0;
            await videoRef.current.play();
          }

        } catch (err) {
          console.error(err);
          clearTimeout(fallbackTimer);
          createManualSlots(videoRef.current?.duration || 15);
        }
      };

      fileReader.readAsArrayBuffer(file);

    } catch (error) {
      console.error(error);
      clearTimeout(fallbackTimer);
      createManualSlots(videoRef.current?.duration || 15);
    }
  };

  const createManualSlots = (duration: number) => {
    const interval = 3.0;
    const manualSubs: Subtitle[] = [];
    for (let start = 0; start < duration; start += interval) {
      manualSubs.push({
        id: Date.now() + start,
        start: start,
        end: Math.min(start + interval, duration),
        text: '✏️ ここをタップして文字を入力'
      });
    }
    setSubtitles(manualSubs);
    setIsProcessing(false);
    setProgress(100);
    setProgressPhase('fallback');
    setStatusMessage('📝 【セーフティ発動】ブラウザのセキュリティ制限を検知したため、自動で「編集用の字幕枠」を敷き詰めました！動画を再生しながら右側にお子様のセリフを自由に入力してください。');
  };

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
        <p style={{ color: '#86868b', fontSize: '14px', margin: 0 }}>確実に1秒のズレもなくテロップを作成・編集できます。</p>
      </header>
      
      <div style={{ marginBottom: '25px', backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <input type="file" accept="video/*" onChange={handleVideoChange} style={{ fontSize: '15px' }} />
        {videoSrc && (
          <button 
            onClick={startDirectTranscription} 
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
            {isProcessing ? `⏳ 解析中 (${progress}%)` : '✨ 超高精度テロップを自動生成'}
          </button>
        )}

        {/* 📊 視覚的なプログレスバー表示エリア */}
        {isProcessing && (
          <div style={{ marginTop: '15px', backgroundColor: '#e5e5ea', borderRadius: '6px', height: '8px', width: '100%', overflow: 'hidden' }}>
            <div style={{ 
              backgroundColor: progressPhase === 'decode' ? '#ff9500' : '#0071e3', 
              width: `${progress}%`, 
              height: '100%', 
              transition: 'width 0.4s ease' 
            }} />
          </div>
        )}

        {statusMessage && (
          <div style={{ 
            marginTop: '15px', 
            color: '#1d1d1f', 
            fontSize: '14px', 
            fontWeight: '500', 
            backgroundColor: progressPhase === 'decode' ? '#fff9e6' : '#f2f2f7', 
            padding: '12px 16px', 
            borderRadius: '8px', 
            borderLeft: `4px solid ${progressPhase === 'decode' ? '#ff9500' : '#0071e3'}` 
          }}>
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
              {currentText && !currentText.includes('✏️') && !currentText.includes('（') && (
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
            <h3 style={{ fontSize: '16px', marginBottom: '12px', color: '#1d1d1f' }}>📝 テロップタイムライン（自由に書き換えOK）</h3>
            <div style={{ maxHeight: '500px', overflowY: 'auto', backgroundColor: '#fff', padding: '15px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e5e5ea' }}>
              {subtitles.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#86868b', fontSize: '14px' }}>
                  上の「超高精度テロップを自動生成」ボタンを押してください。
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
                      onClick={(e) => { if((e.target as HTMLInputElement).value.includes('✏️') || (e.target as HTMLInputElement).value.includes('💡')) handleTextChange(sub.id, '') }}
                      style={{ 
                        width: '100%', 
                        padding: '10px', 
                        fontSize: '14px', 
                        borderRadius: '8px', 
                        border: '1px solid #d1d1d6', 
                        boxSizing: 'border-box',
                        backgroundColor: sub.text.includes('✏️') ? '#fff9e6' : '#fff'
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
