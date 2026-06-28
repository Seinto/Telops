import React, { useState, useRef, useEffect } from 'react';
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

  // 裏側で動画を再生して音声を録音・抽出する関数（Safari対応）
  const extractAudioForSafari = async (file: File): Promise<Float32Array> => {
    return new Promise(async (resolve, reject) => {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const blobUrl = URL.createObjectURL(file);
        
        const audioEl = document.createElement('audio');
        audioEl.src = blobUrl;
        audioEl.muted = false;
        audioEl.playsInline = true;
        audioEl.playbackRate = 16.0; // 16倍速で高速抽出

        const source = audioCtx.createMediaElementSource(audioEl);
        
        const maxDuration = 300; 
        const bufferSize = 16000 * maxDuration;
        const internalBuffer = new Float32Array(bufferSize);
        let writeIndex = 0;

        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          if (writeIndex + inputData.length < internalBuffer.length) {
            internalBuffer.set(inputData, writeIndex);
            writeIndex += inputData.length;
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);

        audioEl.onended = () => {
          audioCtx.close();
          URL.revokeObjectURL(blobUrl);
          const finalAudioData = internalBuffer.slice(0, writeIndex);
          resolve(finalAudioData);
        };

        audioEl.onerror = () => reject(new Error("動画の音声デコードに失敗しました。"));
        await audioEl.play();
      } catch (err) {
        reject(err);
      }
    });
  };

  // 🤖 AIによる高精度音声認識処理
  const generateCaptions = async () => {
    if (!videoFile) return;
    setIsProcessing(true);
    setStatusMessage('🧠 強化版AIモデル(Base)を準備中... (初回のみ1分〜2分かかります)');

    try {
      setStatusMessage('🎵 動画の音声を高精度でデコード中...');
      const audioData = await extractAudioForSafari(videoFile);

      if (!audioData || audioData.length === 0) {
        throw new Error("音声データが空です。");
      }

      // 💡 【パワーアップ】モデルを 'Xenova/whisper-tiny' から 'Xenova/whisper-base' に変更
      setStatusMessage('🧠 高精度AI(Whisper Base)をロード中...');
      const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      setStatusMessage('🗣️ 端末内で言葉をじっくり解析中... (100%安全なオフライン処理)');
      
      // 💡 日本語に完全に固定し、より細かくタイムスタンプを切り出すチューニング
      const result = await transcriber(audioData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
        language: 'japanese',
        task: 'transcribe',
        // 幻聴（ハルシネーション）を防ぐためのパラメータを追加
        temperature: 0.0, 
      });

      if (result && (result as any).chunks && (result as any).chunks.length > 0) {
        const chunks = (result as any).chunks;
        
        // 空白文字だけのゴミデータを排除してマッピング
        const formattedSubtitles: Subtitle[] = chunks
          .map((chunk: any, index: number) => ({
            id: index + 1,
            start: chunk.timestamp ? chunk.timestamp[0] : index * 3,
            end: chunk.timestamp ? chunk.timestamp[1] : (index + 1) * 3,
            text: chunk.text.trim()
          }))
          .filter((sub: Subtitle) => sub.text.length > 0);

        if (formattedSubtitles.length === 0) {
          throw new Error("音声は聞き取れましたが、文字に変換できませんでした。マイクの距離や音量を確認してください。");
        }

        setSubtitles(formattedSubtitles);
        setStatusMessage('🎉 高精度テロップの自動生成が完了しました！');
      } else if (result && (result as any).text && (result as any).text.trim().length > 0) {
        setSubtitles([{ id: 1, start: 0.0, end: (videoRef.current?.duration || 10.0), text: (result as any).text.trim() }]);
        setStatusMessage('🎉 テロップを生成しました（単一ブロック）');
      } else {
        throw new Error("言葉を認識できませんでした。");
      }

    } catch (error: any) {
      console.error(error);
      setStatusMessage(`❌ エラー: ${error.message || '音声の解析に失敗しました。'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 再生時間の監視タイマー
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
        <h1 style={{ fontSize: '24px', margin: 0 }}>🎥 完全ローカル自動テロップ PWA (高精度版)</h1>
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
          <div style={{ marginTop: '10px', color: statusMessage.startsWith('❌') ? '#ff3b30' : '#0071e3', fontSize: '14px', fontWeight: 'bold' }}>
            {statusMessage}
          </div>
        )}
      </div>

      {videoSrc && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
