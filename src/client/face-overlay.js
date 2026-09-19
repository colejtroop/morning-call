function videoTransform(video, canvas) {
  const sourceRatio = video.videoWidth / video.videoHeight;
  const targetRatio = canvas.width / canvas.height;
  if (sourceRatio > targetRatio) {
    const height = canvas.height;
    const width = height * sourceRatio;
    return { width, height, x: (canvas.width - width) / 2, y: 0 };
  }
  const width = canvas.width;
  const height = width / sourceRatio;
  return { width, height, x: 0, y: (canvas.height - height) / 2 };
}

export function drawFaceOverlay(canvas, video, pose, { calibrating = false, approved = false } = {}) {
  const scale = devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * scale);
  const height = Math.round(canvas.clientHeight * scale);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  if (!video.videoWidth) return;
  const transform = videoTransform(video, canvas);
  context.shadowColor = approved ? "rgba(92,255,165,.55)" : "transparent";
  context.shadowBlur = approved ? 3 * scale : 0;
  if (calibrating) {
    const targetY = transform.y + transform.height * 0.43;
    context.lineWidth = Math.max(2, 1.6 * scale);
    context.strokeStyle = "rgba(157,248,200,.92)";
    for (const targetX of [0.42, 0.58]) {
      context.beginPath();
      context.ellipse(transform.x + transform.width * targetX, targetY, 16 * scale, 10 * scale, 0, 0, Math.PI * 2);
      context.stroke();
    }
  }
  if (!pose) return;
}

const FACE_CONTOURS = [
  [33,160,158,133,153,144,33], [362,385,387,263,373,380,362],
  [61,40,37,0,267,270,291,321,314,17,84,91,61]
];

export function drawFaceMesh(canvas, video, landmarks, { approved = false, topology = null } = {}) {
  if (!landmarks || !video.videoWidth) return;
  const context = canvas.getContext("2d");
  const transform = videoTransform(video, canvas);
  const scale = devicePixelRatio || 1;
  const map = ({ x, y }) => ({ x: transform.x + x * transform.width, y: transform.y + y * transform.height });
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  const drawConnections = (connections, color, lineWidth) => {
    if (!connections) return;
    context.strokeStyle = color; context.lineWidth = lineWidth * scale;
    for (const connection of connections) {
      const start = connection.start ?? connection[0]; const end = connection.end ?? connection[1];
      const a = map(landmarks[start]); const b = map(landmarks[end]);
      if (!a || !b) continue;
      context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    }
  };
  const base = approved ? "rgba(92,255,165,.3)" : "rgba(255,255,255,.18)";
  const strong = approved ? "rgba(92,255,165,.98)" : "rgba(255,255,255,.88)";
  drawConnections(topology?.tesselation, base, .55);
  context.shadowColor = approved ? "rgba(92,255,165,.5)" : "transparent";
  context.shadowBlur = approved ? 2 * scale : 0;
  for (const region of ["faceOval","leftEye","rightEye","leftEyebrow","rightEyebrow","lips"]) drawConnections(topology?.[region], strong, 1.25);
  if (!topology) {
    context.strokeStyle = strong; context.lineWidth = 1.1 * scale;
    for (const contour of FACE_CONTOURS) { context.beginPath(); contour.forEach((index, offset) => { const p = map(landmarks[index]); offset ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y); }); context.stroke(); }
  }
}

export function screenPointToVideo(canvas, video, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scale = devicePixelRatio || 1;
  const transform = videoTransform(video, canvas);
  const canvasX = (rect.right - clientX) * scale;
  const canvasY = (clientY - rect.top) * scale;
  return {
    x: Math.max(0, Math.min(1, (canvasX - transform.x) / transform.width)),
    y: Math.max(0, Math.min(1, (canvasY - transform.y) / transform.height))
  };
}

const BODY_CONNECTIONS = [[11,12],[11,23],[12,24],[23,24],[11,13],[13,15],[12,14],[14,16],[23,25],[25,27],[24,26],[26,28]];

export function drawBodyOverlay(canvas, video, landmarks, { approved = false } = {}) {
  drawFaceOverlay(canvas, video, null);
  if (!landmarks || !video.videoWidth) return;
  const context = canvas.getContext("2d");
  const transform = videoTransform(video, canvas);
  const map = ({ x, y }) => ({ x: transform.x + x * transform.width, y: transform.y + y * transform.height });
  context.lineWidth = Math.max(2, 1.5 * (devicePixelRatio || 1));
  context.strokeStyle = approved ? "rgba(92,255,165,.98)" : "rgba(157,248,200,.85)";
  context.shadowColor = approved ? "rgba(92,255,165,.9)" : "transparent";
  context.shadowBlur = approved ? 12 * (devicePixelRatio || 1) : 0;
  for (const [from, to] of BODY_CONNECTIONS) {
    const a = map(landmarks[from]); const b = map(landmarks[to]);
    context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
  }
  context.fillStyle = approved ? "rgba(92,255,165,.98)" : "rgba(98,180,255,.9)";
  for (const index of new Set(BODY_CONNECTIONS.flat())) { const p = map(landmarks[index]); context.beginPath(); context.arc(p.x, p.y, 3 * (devicePixelRatio || 1), 0, Math.PI * 2); context.fill(); }
}
