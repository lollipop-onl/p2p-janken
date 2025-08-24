import { useState, useRef, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import * as pako from "pako";

type Hand = "rock" | "paper" | "scissors" | null;
type GameResult = "win" | "lose" | "draw" | null;

interface GameState {
  myHand: Hand;
  opponentHand: Hand;
  result: GameResult;
  gameId: string;
}

interface ConnectionData {
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidate[];
}

const HAND_EMOJIS = {
  rock: "✊",
  paper: "✋",
  scissors: "✌️",
};

const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export const App = () => {
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [isHost, setIsHost] = useState<boolean>(false);
  const [roomId, setRoomId] = useState<string>("");
  const [gameState, setGameState] = useState<GameState>({
    myHand: null,
    opponentHand: null,
    result: null,
    gameId: "",
  });
  const [isWaiting, setIsWaiting] = useState<boolean>(false);
  const [iceCandidates, setIceCandidates] = useState<RTCIceCandidate[]>([]);
  const [isGatheringComplete, setIsGatheringComplete] =
    useState<boolean>(false);
  const [offerUrl, setOfferUrl] = useState<string>("");
  const [answerUrl, setAnswerUrl] = useState<string>("");
  const [copyStatus, setCopyStatus] = useState<string>("");
  const [showQrScanner, setShowQrScanner] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);

  const initializePeerConnection = () => {
    peerConnection.current = new RTCPeerConnection(STUN_SERVERS);
    setIceCandidates([]);
    setIsGatheringComplete(false);

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("ICE candidate:", event.candidate);
        setIceCandidates((prev) => [...prev, event.candidate!]);
      } else {
        // ICE gathering完了
        console.log("ICE gathering completed");
        setIsGatheringComplete(true);
      }
    };

    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current?.connectionState;
      console.log("Connection state changed:", state);
      if (state === "connected") {
        setConnectionState("connected");
      } else if (state === "disconnected" || state === "failed") {
        setConnectionState("disconnected");
      }
    };

    peerConnection.current.oniceconnectionstatechange = () => {
      const state = peerConnection.current?.iceConnectionState;
      console.log("ICE connection state:", state);
    };
  };

  const createOffer = async () => {
    if (!peerConnection.current) return;

    dataChannel.current = peerConnection.current.createDataChannel("game");
    setupDataChannel();

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);

    return offer;
  };

  const createAnswer = async (connectionData: ConnectionData) => {
    if (!peerConnection.current) return;

    peerConnection.current.ondatachannel = (event) => {
      dataChannel.current = event.channel;
      setupDataChannel();
    };

    // リモート記述を設定
    await peerConnection.current.setRemoteDescription(connectionData.sdp);

    // ICE候補を追加
    for (const candidate of connectionData.candidates) {
      try {
        await peerConnection.current.addIceCandidate(candidate);
        console.log("Added ICE candidate:", candidate);
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    }

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);

    return answer;
  };

  const setupDataChannel = () => {
    if (!dataChannel.current) return;

    dataChannel.current.onopen = () => {
      console.log("Data channel opened");
      setConnectionState("connected");
    };

    dataChannel.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleMessage(data);
    };
  };

  const sendMessage = (message: any) => {
    if (dataChannel.current && dataChannel.current.readyState === "open") {
      dataChannel.current.send(JSON.stringify(message));
    }
  };

  const handleMessage = (data: any) => {
    switch (data.type) {
      case "handSelected":
        setGameState((prev) => {
          const newState = {
            ...prev,
            opponentHand: data.hand,
            gameId: data.gameId,
          };

          // 両方の手が揃ったら勝敗判定
          if (newState.myHand && data.hand) {
            const result = determineWinner(newState.myHand, data.hand);
            return {
              ...newState,
              result,
            };
          }

          return newState;
        });

        // 待機状態を解除
        setIsWaiting(false);
        break;

      case "newGame":
        resetGame();
        break;
    }
  };

  const determineWinner = (myHand: Hand, opponentHand: Hand): GameResult => {
    if (!myHand || !opponentHand) return null;

    if (myHand === opponentHand) return "draw";

    const winConditions = {
      rock: "scissors",
      paper: "rock",
      scissors: "paper",
    };

    return winConditions[myHand] === opponentHand ? "win" : "lose";
  };

  const selectHand = (hand: Hand) => {
    if (!hand || gameState.myHand || connectionState !== "connected") return;

    const gameId = Date.now().toString();

    sendMessage({
      type: "handSelected",
      hand,
      gameId,
    });

    setGameState((prev) => {
      const newState = {
        ...prev,
        myHand: hand,
        gameId,
      };

      // 相手がすでに選択済みの場合は即座に勝敗判定
      if (prev.opponentHand) {
        const result = determineWinner(hand, prev.opponentHand);
        return {
          ...newState,
          result,
        };
      }

      return newState;
    });

    // 相手がまだ選択していない場合のみ待機状態に
    if (!gameState.opponentHand) {
      setIsWaiting(true);
    }
  };

  const resetGame = () => {
    setGameState({
      myHand: null,
      opponentHand: null,
      result: null,
      gameId: "",
    });
    setIsWaiting(false);
  };

  const startNewGame = () => {
    resetGame();
    sendMessage({ type: "newGame" });
  };

  const createRoom = async () => {
    // Clear URL parameters
    window.history.replaceState({}, "", window.location.pathname);

    const newRoomId = Math.random().toString(36).substring(2, 8);
    setRoomId(newRoomId);
    setIsHost(true);
    setConnectionState("connecting");

    initializePeerConnection();
    await createOffer();

    console.log("Room created:", newRoomId);
    console.log("Waiting for ICE gathering to complete...");
  };

  // ICE gathering完了時にOfferを表示
  useEffect(() => {
    if (
      isHost &&
      isGatheringComplete &&
      peerConnection.current?.localDescription
    ) {
      const connectionData: ConnectionData = {
        sdp: peerConnection.current.localDescription,
        candidates: iceCandidates,
      };

      const url = generateOfferUrl(connectionData);
      setOfferUrl(url);

      console.log("=== OFFER URL GENERATED ===");
      console.log(url);
      console.log("=== COPY THIS OFFER ===");
      console.log(JSON.stringify(connectionData));
      console.log("======================");
    }
  }, [isHost, isGatheringComplete, iceCandidates]);

  // ゲスト側のICE gathering完了時にAnswerを表示
  useEffect(() => {
    if (
      !isHost &&
      isGatheringComplete &&
      peerConnection.current?.localDescription
    ) {
      const connectionData: ConnectionData = {
        sdp: peerConnection.current.localDescription,
        candidates: iceCandidates,
      };

      const url = generateAnswerUrl(connectionData);
      setAnswerUrl(url);

      console.log("=== ANSWER URL GENERATED ===");
      console.log(url);
      console.log("=== COPY THIS ANSWER ===");
      console.log(JSON.stringify(connectionData));
      console.log("========================");
    }
  }, [isHost, isGatheringComplete, iceCandidates]);

  const handleOfferFromUrl = async (offerData: string) => {
    try {
      // Base64デコードしてpako展開
      const base64Compressed = decodeURIComponent(offerData);
      const compressed = Uint8Array.from(atob(base64Compressed), (c) =>
        c.charCodeAt(0)
      );
      const jsonString = pako.inflate(compressed, { to: "string" });
      const connectionData: ConnectionData = JSON.parse(jsonString);

      setIsHost(false);
      setConnectionState("connecting");
      setRoomId("url-shared");

      initializePeerConnection();
      await createAnswer(connectionData);

      console.log("Offer received from URL, generating answer...");
    } catch (error) {
      console.error("Invalid offer in URL:", error);
    }
  };

  const handleAnswerFromUrl = async (answerData: string) => {
    try {
      // Base64デコードしてpako展開
      const base64Compressed = decodeURIComponent(answerData);
      const compressed = Uint8Array.from(atob(base64Compressed), (c) =>
        c.charCodeAt(0)
      );
      const jsonString = pako.inflate(compressed, { to: "string" });
      const connectionData: ConnectionData = JSON.parse(jsonString);

      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(connectionData.sdp);

        for (const candidate of connectionData.candidates) {
          try {
            await peerConnection.current.addIceCandidate(candidate);
          } catch (error) {
            console.error("Error adding ICE candidate:", error);
          }
        }
        console.log("Answer received from URL, connection should establish");
      }
    } catch (error) {
      console.error("Invalid answer in URL:", error);
    }
  };

  const generateOfferUrl = (connectionData: ConnectionData) => {
    const baseUrl = window.location.origin + window.location.pathname;
    const jsonString = JSON.stringify(connectionData);

    // pakoで圧縮してBase64エンコード
    const compressed = pako.deflate(jsonString);
    const base64Compressed = btoa(String.fromCharCode(...compressed));
    const encodedOffer = encodeURIComponent(base64Compressed);

    return `${baseUrl}?offer=${encodedOffer}`;
  };

  const generateAnswerUrl = (connectionData: ConnectionData) => {
    const baseUrl = window.location.origin + window.location.pathname;
    const jsonString = JSON.stringify(connectionData);

    // pakoで圧縮してBase64エンコード
    const compressed = pako.deflate(jsonString);
    const base64Compressed = btoa(String.fromCharCode(...compressed));
    const encodedAnswer = encodeURIComponent(base64Compressed);

    return `${baseUrl}?answer=${encodedAnswer}`;
  };

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${type}をコピーしました！`);
      setTimeout(() => setCopyStatus(""), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      setCopyStatus("コピーに失敗しました");
      setTimeout(() => setCopyStatus(""), 2000);
    }
  };

  const joinRoom = async () => {
    // Clear URL parameters
    window.history.replaceState({}, "", window.location.pathname);

    if (!roomId) return;

    setIsHost(false);
    setConnectionState("connecting");

    const offerText = prompt("Paste the offer from the host:");
    if (!offerText) return;

    try {
      const connectionData: ConnectionData = JSON.parse(offerText);
      initializePeerConnection();
      await createAnswer(connectionData);

      console.log("Waiting for ICE gathering to complete...");
    } catch (error) {
      console.error("Invalid offer format");
      alert("無効なオファー形式です");
    }
  };

  const handleAnswerSubmit = async () => {
    const answerText = prompt("Paste the answer from the guest:");
    if (!answerText || !peerConnection.current) return;

    try {
      const connectionData: ConnectionData = JSON.parse(answerText);

      await peerConnection.current.setRemoteDescription(connectionData.sdp);

      for (const candidate of connectionData.candidates) {
        try {
          await peerConnection.current.addIceCandidate(candidate);
          console.log("Added ICE candidate:", candidate);
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }
    } catch (error) {
      console.error("Invalid answer format:", error);
      alert("無効なアンサー形式です");
    }
  };

  // URLパラメータから初期データを取得
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const offerData = urlParams.get("offer");
    const answerData = urlParams.get("answer");

    if (offerData) {
      // Offerが含まれているURL - ゲストとして自動参加
      handleOfferFromUrl(offerData);
    } else if (answerData) {
      // Answerが含まれているURL - ホストとして自動処理
      handleAnswerFromUrl(answerData);
    }
  }, []);

  // QRスキャナーの開始
  const startQrScanner = async () => {
    try {
      if (!readerRef.current) {
        readerRef.current = new BrowserMultiFormatReader();
      }

      const videoInputDevices = await readerRef.current.listVideoInputDevices();
      const backCamera =
        videoInputDevices.find(
          (device) =>
            device.label.toLowerCase().includes("back") ||
            device.label.toLowerCase().includes("rear")
        ) || videoInputDevices[0];

      if (videoRef.current) {
        readerRef.current.decodeFromVideoDevice(
          backCamera?.deviceId,
          videoRef.current,
          (result, error) => {
            if (result) {
              setShowQrScanner(false);
              stopQrScanner();

              try {
                const url = new URL(result.getText());
                const answerData = url.searchParams.get("answer");
                if (answerData) {
                  handleAnswerFromUrl(answerData);
                } else {
                  alert("有効なAnswerQRコードではありません");
                }
              } catch (urlError) {
                alert("有効なURLではありません");
              }
            }
            if (error && error.name !== "NotFoundException") {
              console.error("QR scan error:", error);
            }
          }
        );
      }
    } catch (error) {
      console.error("Failed to start QR scanner:", error);
      alert("カメラの起動に失敗しました");
    }
  };

  // QRスキャナーの停止
  const stopQrScanner = () => {
    if (readerRef.current) {
      readerRef.current.reset();
    }
  };

  // コンポーネントのクリーンアップ
  useEffect(() => {
    return () => {
      stopQrScanner();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-center mb-6">
          🪨📄✂️ P2P じゃんけん
        </h1>

        {/* コピー状態表示 */}
        {copyStatus && (
          <div className="mb-4 p-2 bg-green-100 border border-green-300 rounded text-green-700 text-sm text-center">
            {copyStatus}
          </div>
        )}

        {/* ルームID表示 */}
        {roomId && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700 font-medium">ルームID:</p>
            <p className="text-lg font-mono text-blue-900 break-all">
              {roomId}
            </p>
          </div>
        )}

        {connectionState === "disconnected" && (
          <div className="space-y-4">
            {/* 手順説明 */}
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h2 className="text-lg font-semibold mb-3 text-gray-800">
                📋 接続手順（簡単モード！）
              </h2>
              <div className="space-y-3 text-sm text-gray-700">
                <div>
                  <p className="font-medium text-blue-600">
                    🏠 ルーム作成の場合:
                  </p>
                  <ol className="list-decimal list-inside ml-4 space-y-1">
                    <li>「ルーム作成」ボタンを押す</li>
                    <li>生成されたURLをコピーして相手に送信</li>
                    <li>相手がそのURLにアクセス</li>
                    <li>相手のURLをクリックするだけ！</li>
                  </ol>
                </div>
                <div>
                  <p className="font-medium text-green-600">
                    🚪 ルーム参加の場合:
                  </p>
                  <ol className="list-decimal list-inside ml-4 space-y-1">
                    <li>ホストから送られてきたURLをクリック</li>
                    <li>自動で接続が始まります</li>
                    <li>生成されたURLをホストに送信</li>
                    <li>完了！</li>
                  </ol>
                </div>
                <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded">
                  <p className="text-xs text-green-700">
                    ✨ 新機能: URLを使えばコピペが最小限に！
                  </p>
                </div>
              </div>
            </div>

            <div>
              <input
                type="text"
                placeholder="ルームID (参加時のみ)"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full p-2 border rounded"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={createRoom}
                className="flex-1 bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
              >
                ルーム作成
              </button>
              <button
                onClick={joinRoom}
                className="flex-1 bg-green-500 text-white p-2 rounded hover:bg-green-600"
              >
                手動参加
              </button>
            </div>
          </div>
        )}

        {connectionState === "connecting" && (
          <div className="text-center">
            <p className="text-gray-600 mb-4">接続中...</p>
            {isHost ? (
              <div className="space-y-3">
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
                  <p className="font-medium mb-2">📤 ステップ 1/2:</p>
                  {isGatheringComplete ? (
                    <div className="space-y-3">
                      <p className="text-green-600">✅ 接続準備完了！</p>

                      {/* QRコード表示 */}
                      {offerUrl && (
                        <div className="bg-white p-4 rounded border flex flex-col items-center">
                          <p className="text-xs text-gray-600 mb-2">
                            📱 スマホでスキャン:
                          </p>
                          <QRCodeSVG
                            value={offerUrl}
                            size={256}
                            level="M"
                            includeMargin={true}
                            className="border rounded"
                          />

                          <p className="mt-2 text-xs text-gray-500">
                            または、以下のURLをコピーして相手に送信
                          </p>
                          <div className="bg-gray-100 p-2 rounded border break-all text-xs font-mono">
                            {offerUrl}
                          </div>
                          <button
                            onClick={() => copyToClipboard(offerUrl, "接続URL")}
                            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 mt-2"
                          >
                            📋 URLをコピー
                          </button>
                        </div>
                      )}

                      {/* QRスキャナー */}
                      <div className="border-t pt-3">
                        <p className="mb-2 text-center">
                          📱 相手のAnswerQRをスキャン:
                        </p>
                        {!showQrScanner ? (
                          <button
                            onClick={() => {
                              setShowQrScanner(true);
                              startQrScanner();
                            }}
                            className="w-full bg-green-500 text-white p-2 rounded hover:bg-green-600"
                          >
                            📷 QRスキャナーを開く
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <div className="relative bg-black rounded overflow-hidden">
                              <video
                                ref={videoRef}
                                style={{
                                  width: "100%",
                                  maxWidth: "300px",
                                  height: "200px",
                                  objectFit: "cover",
                                }}
                                autoPlay
                                muted
                                playsInline
                              />
                              <div className="absolute inset-0 border-2 border-red-500 border-dashed pointer-events-none">
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-4 border-red-500"></div>
                              </div>
                            </div>
                            <p className="text-xs text-center text-gray-600">
                              QRコードを枠内に合わせてください
                            </p>
                            <button
                              onClick={() => {
                                setShowQrScanner(false);
                                stopQrScanner();
                              }}
                              className="w-full bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
                            >
                              スキャナーを閉じる
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="border-t pt-3 mt-3">
                        <p className="mb-2">従来方式（手動入力）:</p>
                        <button
                          onClick={() => {
                            if (peerConnection.current?.localDescription) {
                              const connectionData: ConnectionData = {
                                sdp: peerConnection.current.localDescription,
                                candidates: iceCandidates,
                              };
                              copyToClipboard(
                                JSON.stringify(connectionData),
                                "Offerデータ"
                              );
                            }
                          }}
                          className="w-full bg-gray-500 text-white p-2 rounded hover:bg-gray-600 text-sm mb-2"
                        >
                          📋 Offerデータをコピー
                        </button>
                        <button
                          onClick={handleAnswerSubmit}
                          className="w-full bg-orange-500 text-white p-2 rounded hover:bg-orange-600"
                        >
                          相手の応答を手動入力
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-yellow-600">⏳ 接続準備中...</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                  <p className="font-medium mb-2">📥 ステップ 2/2:</p>
                  {isGatheringComplete ? (
                    <div className="space-y-3">
                      <p className="text-green-600">✅ 応答準備完了！</p>

                      {/* Answer QRコード表示 */}
                      {answerUrl && (
                        <div className="bg-white p-4 rounded border flex flex-col items-center">
                          <p className="text-xs text-gray-600 mb-2">
                            📱 ホストにこのQRを見せてスキャンしてもらう:
                          </p>
                          <QRCodeSVG
                            value={answerUrl}
                            size={256}
                            level="M"
                            includeMargin={true}
                            className="border rounded"
                          />
                          <p className="mt-2 text-xs text-center text-gray-500">
                            ホストがQRをスキャンすると自動接続されます
                          </p>
                        </div>
                      )}

                      <p>または、URLをホストに送信してください：</p>
                      <div className="bg-white p-2 rounded border break-all text-xs font-mono">
                        {answerUrl}
                      </div>
                      <button
                        onClick={() => copyToClipboard(answerUrl, "応答URL")}
                        className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
                      >
                        📋 URLをコピー
                      </button>
                      <div className="border-t pt-3 mt-3">
                        <p className="mb-2 text-xs">
                          従来方式（Answerデータのみ）:
                        </p>
                        <button
                          onClick={() => {
                            if (peerConnection.current?.localDescription) {
                              const connectionData: ConnectionData = {
                                sdp: peerConnection.current.localDescription,
                                candidates: iceCandidates,
                              };
                              copyToClipboard(
                                JSON.stringify(connectionData),
                                "Answerデータ"
                              );
                            }
                          }}
                          className="w-full bg-gray-500 text-white p-2 rounded hover:bg-gray-600 text-sm"
                        >
                          📋 Answerデータをコピー
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-yellow-600">⏳ 応答準備中...</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {connectionState === "connected" && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-green-600 font-semibold mb-4">
                ✅ 接続完了
              </div>

              {!gameState.myHand && !isWaiting && (
                <div>
                  <p className="mb-4">手を選んでください：</p>
                  <div className="flex justify-center space-x-4">
                    {Object.entries(HAND_EMOJIS).map(([hand, emoji]) => (
                      <button
                        key={hand}
                        onClick={() => selectHand(hand as Hand)}
                        className="text-4xl p-3 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(gameState.myHand || isWaiting) && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">あなた</p>
                      <div className="text-4xl">
                        {gameState.myHand
                          ? HAND_EMOJIS[gameState.myHand]
                          : "❓"}
                      </div>
                    </div>
                    <div className="text-2xl">VS</div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">相手</p>
                      <div className="text-4xl">
                        {gameState.opponentHand
                          ? HAND_EMOJIS[gameState.opponentHand]
                          : "❓"}
                      </div>
                    </div>
                  </div>

                  {isWaiting && (
                    <p className="text-yellow-600">
                      相手の選択を待っています...
                    </p>
                  )}

                  {gameState.result && (
                    <div className="space-y-4">
                      <div
                        className={`text-xl font-bold ${
                          gameState.result === "win"
                            ? "text-green-600"
                            : gameState.result === "lose"
                            ? "text-red-600"
                            : "text-yellow-600"
                        }`}
                      >
                        {gameState.result === "win"
                          ? "🎉 勝利！"
                          : gameState.result === "lose"
                          ? "😢 敗北..."
                          : "🤝 引き分け"}
                      </div>
                      {isHost ? (
                        <button
                          onClick={startNewGame}
                          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        >
                          もう一度
                        </button>
                      ) : (
                        <div className="text-gray-600 text-sm">
                          ホストが次のゲームを開始するまでお待ちください...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
