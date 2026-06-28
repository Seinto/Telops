import React, { useState, useRef, useEffect } from 'react';
import { useWhisperTranscriber, WhisperChunk } from './useWhisperTranscriber';

interface Subtitle {
  id: number;
  start: number;
  end: number;
  text: string;
}

// word単位のタイムスタンプを、自然な区切りの字幕セグメントにまとめる。
// 「句点・読点・！？・一定の無音ギャップ・最大文字数」のいずれかで区切る。
function chunksToSubtitles(chunks: WhisperChunk[]): Subtitle[] {
  const subtitles: Subtitle[] = [];
  let buffer: WhisperChunk[] = [];
  const MAX_CHARS = 24;
  const MAX_GAP_SECONDS = 1.2;

  const flush = () => {
    if (buffer.length === 0) return;
    const text = buffer.map((c) => c.text).join('').trim();
    if (!text) {
      buffer = [];
      return;
    }
    const start = buffer[0].timestamp[0] ?? 0;
    const lastTimestamp = buffer[buffer.length - 1].timestamp;
    const end = lastTimestamp[1] ?? lastTimestamp[0] ?? start + 1;
    subtitles.push({
      id: Date.now() + Math.random(),
      start,
      end,
      text,
    });
    buffer = [];
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const prev = buffer[buffer.length - 1];

    // 前の単語との間隔が大きく空いていれば、そこで区切る（発言の切れ目とみなす）
    if (prev) {
      const prevEnd = prev.timestamp[1] ?? prev.timestamp[0] ?? 0;
      const currentStart = chunk.timestamp[0] ?? prevEnd;
      if (currentStart - prevEnd > MAX_GAP_SECONDS) {
        flush();
      }
    }

    buffer.push(chunk);

    const currentText = buffer.map((c) => c.text).join('');
    const endsWithPunctuation = /[。！？!?]\s*$/.test(chunk.text);

    if (endsWithPunctuation || currentText.length >= MAX_CHARS) {
      flush();
    }
  }
  flush();

  return subtitles;
}

export default function App() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [currentText, setCurrentText] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const { transcribe, isModelLoading, modelLoadProgress, isTranscribing } = useWhisperTranscriber();

  const isProcessing = isModelLoading || isTranscribing;

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setVideoFile(file);
      setSubtitles([]);
      setCurrentText('');
      setStatusMessage('💡 動画が読み込まれました。「✨ 超高精度テロップを自動生成」を押してください。');
    }
  };

  // 🗣️ ブラウザ内で動く無料のAIモデル（Whisper / transformers.js）で
  //    動画の音声を文字起こしする処理。マイクもAPIキーも使わない。
  const startAutoTranscription = async () => {
    if (!videoFile) {
      setStatusMessage('❌ 動画ファイルが選択されていません。');
      return;
    }

    setSubtitles([]);
    setCurrentText('');
    setStatusMessage('⏳ AIモデルを準備しています（初回はダウンロードのため数十秒〜数分かかります）...');

    try {
      const result = await transcribe(videoFile);

      if (!result?.chunks || result.chunks.length === 0) {
        if (result?.text?.trim()) {
          // チャンク（タイムスタンプ）が取得できない場合でも、全体テキストだけは表示する
          setSubtitles([{
            id: Date.now(),
            start: 0,
            end: videoRef.current?.duration ?? 0,
            text: result.text.trim(),
          }]);
          setStatusMessage('🎉 テロップを生成しました（タイムスタンプが取得できなかったため、全文を1件で表示しています）。');
        } else {
          setStatusMessage('⚠️ 音声が検出できませんでした。動画に声がしっかり入っているかご確認ください。');
        }
        return;
      }

      const newSubtitles = chunksToSubtitles(result.chunks);
      setSubtitles(newSubtitles);
      setStatusMessage(`🎉 全自動テロップ生成が完了しました！（${newSubtitles.length}件のセリフを検出）右側の一覧から自由に文字を修正・編集できます。`);
    } catch (err: any) {
      console.error(err);
      const message = err?.message ?? String(err);
      if (message.includes('decodeAudioData')) {
        setStatusMessage('❌ 動画の音声を読み込めませんでした。動画形式（mp4/mov等）をご確認ください。');
      } else {
        setStatusMessage(`❌ 文字起こし中にエラーが発生しました：${message}`);
      }
    }
  };

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

  const buttonLabel = isModelLoading
    ? `⏳ AIモデルをダウンロード中... ${modelLoadProgress}%`
    : isTranscribing
      ? '⏳ 音声を解析中...'
      : '✨ 超高精度テロップを自動生成';

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f5f7fa', minHeight: '100vh' }}>
      <header style={{ marginBottom: '25px', backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <h1 style={{ fontSize: '24px', margin: '0 0 5px 0', color: '#1d1d1f' }}>🎥 お子様動画専用・自動テロップ編集アプリ</h1>
        <p style={{ color: '#86868b', fontSize: '14px', margin: 0 }}>動画を選ぶだけで、ズレのないテロップを完全自動で生成します。</p>
      </header>

      <div style={{ marginBottom: '25px', backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <input type="file" accept="video/*" onChange={handleVideoChange} style={{ fontSize: '15px' }} />
          {videoSrc && (
            <button
              onClick={startAutoTranscription}
              disabled={isProcessing}
              style={{
                padding: '10px 20px',
                backgroundColor: isProcessing ? '#ccc' : '#0071e3',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: isProcessing ? 'default' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              {buttonLabel}
            </button>
          )}
        </div>

        {statusMessage && (
          <div style={{ marginTop: '15px', color: '#1d1d1f', fontSize: '14px', fontWeight: '500', backgroundColor: '#f2f2f7', padding: '12px 16px', borderRadius: '8px', borderLeft: '4px solid #0071e3' }}>
            {statusMessage}
          </div>
        )}

        <div style={{ marginTop: '12px', color: '#86868b', fontSize: '12px', lineHeight: 1.6 }}>
          ⚙️ この機能はブラウザの中だけで動くAI（Whisper）を使って文字起こしします。マイクもAPIキーも、サーバーへのアップロードも不要で完全無料です。
          初回はAIモデル（数十MB）のダウンロードが必要なため、少し時間がかかります。一度ダウンロードすれば次回以降は高速化されます。
          動画が長い場合や端末の性能によっては、解析に数分かかることがあります。
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
