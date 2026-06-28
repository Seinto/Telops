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
  // ユーザーが「停止」ボタン等で明示的に止めたかどうかを判定するためのフラグ
  //（onendの自動再開ループが、終了後やエラー後にも再起動してしまうのを防ぐ）
  const shouldContinueRef = useRef<boolean>(false);

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

  const stopAutoTranscription = () => {
    shouldContinueRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped
      }
    }
    setIsProcessing(false);
  };

  // 🗣️ マイクから動画の音声を拾ってテロップを生成する処理
  // ⚠️ Web Speech API はブラウザの「マイク入力」を音声認識のソースとしており、
  //    動画ファイルの音声トラックを直接読み込むことはできません（Safari/Chrome共通の仕様）。
  //    そのため、スマホ/PCのスピーカーから動画を再生し、その音をマイクが拾う形になります。
  //    静かな環境で、スピーカー音量を上げてお使いください（ヘッドホン使用時は認識できません）。
  const startAutoTranscription = () => {
    const targetWindow = window as any;
    const SpeechRecognition = targetWindow.SpeechRecognition || targetWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setStatusMessage('❌ お使いのブラウザは音声認識に対応していません。最新のSafari（iOS/macOS）かChromeでお試しください。');
      return;
    }

    if (!videoRef.current) return;

    // Safari は https（または localhost）でない環境だと SpeechRecognition 自体を
    // 動かさないことがあるため、明示的にチェックしてユーザーに伝える
    const isSecureContext = window.isSecureContext;
    if (!isSecureContext) {
      setStatusMessage('❌ このページは安全な接続（https）で開かれていないため、音声認識を利用できません。');
      return;
    }

    setIsProcessing(true);
    setSubtitles([]);
    setStatusMessage('🎤 マイクの使用許可を確認しています...');

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ja-JP';

    activeStartRef.current = 0;
    shouldContinueRef.current = true;

    recognition.onstart = () => {
      setStatusMessage('🗣️ 動画を再生し、マイクで音声を解析しています。スピーカーの音量を上げて静かな環境でお待ちください。');

      // play() はユーザーのクリックイベントから直接呼ばれる startAutoTranscription 内の
      // 同期処理に含めるのが理想だが、recognition.start() 自体が非同期で完了するため
      // onstart 内では Safari がブロックする可能性がある。
      // そのため、再生開始はボタンクリック直後（下の onClick 側）で行う設計に変更している。
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

    recognition.onerror = (event: any) => {
      shouldContinueRef.current = false;
      setIsProcessing(false);

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setStatusMessage('❌ マイクの使用が許可されていません。Safariの「設定」→「Webサイト」→「マイク」、またはアドレスバーのアイコンから許可を確認してください。');
      } else if (event.error === 'no-speech') {
        setStatusMessage('⚠️ 音声が検出できませんでした。スピーカー音量を上げて、もう一度お試しください。');
      } else if (event.error === 'audio-capture') {
        setStatusMessage('❌ マイクが見つかりません。マイク付きの端末でお試しください。');
      } else {
        setStatusMessage(`❌ 音声認識でエラーが発生しました（${event.error}）。もう一度お試しください。`);
      }

      if (videoRef.current) {
        videoRef.current.pause();
      }
    };

    recognition.onend = () => {
      const video = videoRef.current;
      const stillPlaying = video && !video.paused && !video.ended && video.currentTime < video.duration - 0.5;

      // ユーザーが停止していない & 動画がまだ続いている場合のみ自動再開
      if (shouldContinueRef.current && stillPlaying) {
        try {
          recognition.start();
        } catch {
          // 連続start呼び出しで例外が出ることがあるため握りつぶして終了扱いにする
          shouldContinueRef.current = false;
          setIsProcessing(false);
        }
      } else {
        shouldContinueRef.current = false;
        setIsProcessing(false);
        if (video && video.ended) {
          setStatusMessage('🎉 全自動テロップ生成が完了しました！右側の一覧から自由に文字を修正・編集できます。');
        }
      }
    };

    recognitionRef.current = recognition;

    // 動画の再生も音声認識の開始も、すべて「ボタンクリック」という
    // 同一のユーザー操作の中で同期的に呼び出すことで、Safariの自動再生・
    // マイク権限ブロックを避ける。
    videoRef.current.currentTime = 0;
    videoRef.current.muted = false;

    const playPromise = videoRef.current.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        setStatusMessage('💡 動画の再生がブロックされました。プレビュー画面の再生ボタン（▶）を押してから、もう一度「✨ 超高精度テロップを自動生成」を押してください。');
        setIsProcessing(false);
        shouldContinueRef.current = false;
        return;
      });
    }

    try {
      recognition.start();
    } catch (err) {
      setStatusMessage('❌ 音声認識を開始できませんでした。ページを再読み込みしてもう一度お試しください。');
      setIsProcessing(false);
      shouldContinueRef.current = false;
    }
  };

  // 動画の再生が終わったら自動的に終了する監視処理
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVideoEnd = () => {
      shouldContinueRef.current = false;
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
        {videoSrc && !isProcessing && (
          <button
            onClick={startAutoTranscription}
            disabled={isProcessing}
            style={{
              marginLeft: '15px',
              padding: '10px 20px',
              backgroundColor: '#0071e3',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            ✨ 超高精度テロップを自動生成
          </button>
        )}
        {videoSrc && isProcessing && (
          <button
            onClick={stopAutoTranscription}
            style={{
              marginLeft: '15px',
              padding: '10px 20px',
              backgroundColor: '#ff3b30',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            ⏹️ 解析を停止
          </button>
        )}

        {statusMessage && (
          <div style={{ marginTop: '15px', color: '#1d1d1f', fontSize: '14px', fontWeight: '500', backgroundColor: '#f2f2f7', padding: '12px 16px', borderRadius: '8px', borderLeft: '4px solid #0071e3' }}>
            {statusMessage}
          </div>
        )}

        <div style={{ marginTop: '12px', color: '#86868b', fontSize: '12px', lineHeight: 1.6 }}>
          ⚠️ この機能はマイクで動画の音を拾って文字起こしします（ブラウザの仕様上、動画ファイルの音声を直接読み込むことはできません）。
          スピーカーの音量を上げ、周囲が静かな環境でお使いください。ヘッドホン再生では認識できません。
          初回はマイクの使用許可ダイアログが表示されるので「許可」を選んでください。
        </div>
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
