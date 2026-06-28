import React, { useState, useRef, useEffect } from 'react';
// Transformers.jsからパイプラインをインポート
import { pipeline } from '@xenova/transformers';

interface Subtitle {
  id: number;
  start: number;
  end: number;
  text: string;
}

export default function App() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [currentText, setCurrentText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setVideoFile(file);
      setSubtitles([]); 
      setCurrentText('');
      setStatusMessage('');
    }
  };

  // 動画ファイルから音声波形データ(Float32Array)を取り出す関数
  const extractAudioData = async (file: File): Promise<Float32Array> => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    // Whisperはモノラル（1ch）の音声を必要とするため、第1チャンネルを取得
    return audioBuffer.getChannelData(0);
  };

  // 🤖 本物のローカルAIによる音声認識処理
  const generateCaptions = async () => {
    if (!videoFile) return;
    setIsProcessing(true);
    setStatusMessage('🤖 AIモデルを準備中... (初回のみ30秒〜1分かかります)');

    try {
      // 1. 動画から音声を抽出
      setStatusMessage('🎵 動画から音声データを抽出しています...');
      const audioData = await extractAudioData(videoFile);

      // 2. ブラウザ用の軽量Whisperモデルをロード
      setStatusMessage('🧠 AI(Whisper Tiny)をブラウザにロード中...');
      const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      // 3. 音声認識を実行（日本語を指定）
      setStatusMessage('🗣️ 端末内で音声を解析中... (通信は発生していません)');
      const result = await transcriber(audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true, // タイムスタンプ（秒数）を取得
        language: 'japanese',
        task: 'transcribe',
      });

      // 4. 解析結果をテロップ形式に変換
      if (result && (result as any).chunks) {
        const chunks = (result as any).chunks;
        const formattedSubtitles: Subtitle[] = chunks.map((chunk: any, index: number) => ({
          id: index + 1,
          // 万が一AIが時間を取れなかった場合のセーフティ
          start: chunk.timestamp ? chunk.timestamp[0] : index * 3,
          end: chunk.timestamp ? chunk.timestamp[1] : (index + 1) * 3,
          text: chunk.text.trim()
        }));

        setSubtitles(formattedSubtitles);
        setStatusMessage('🎉 テロップの自動生成が完了しました！');
      } else {
        // フォールバック（うまく切り出せなかった場合全体を1つに）
        setSubtitles([{ id: 1, start: 0.0, end: 10.0, text: (result as any).text }]);
        setStatusMessage('⚠️ タイムスタンプの自動分離に失敗したため、一括出力しました。');
      }

    } catch (error) {
      console.error(error);
      setStatusMessage('❌ エラーが発生しました。動画の形式や端末のメモリを確認してください。');
    } finally {
      setIsProcessing(false);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
    }
  };

  // 再生時間の強制監視タイマー（100msごと）
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
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '30px', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>🎥 完全ローカル自動テロップ PWA</h1>
        <p style={{ color: '#666', fontSize: '14px' }}>動画データをどこにも送信せず、端末内のAIだけで安全にテロップを生成します。</p>
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
            {isProcessing ? 'AI解析中...' : '✨ 本物のAIテロップを生成'}
          </button>
        )}
        {statusMessage && (
          <div style={{ marginTop: '10px', color: '#0071e3', fontSize: '14px', fontWeight: 'bold' }}>
            {statusMessage}
          </div>
        )}
      </div>

      {videoSrc && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* 左側：プレビュー */}
          <div>
            <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>プレビュー</h3>
            <div style={{ position: 'relative', width: '100%', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden', zIndex: 1 }}>
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                playsInline
                style={{ width: '100%', display: 'block', position: 'relative', zIndex: 2 }}
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
                  zIndex: 9999,
                  pointerEvents: 'none'
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
                動画を選択し、「本物のAIテロップを生成」ボタンを押してください。
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
