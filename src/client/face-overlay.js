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

export function drawFaceOverlay(canvas, video, pose, { calibrating = false } = {}) {
  const scale = devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * scale);
  const height = Math.round(canvas.clientHeight * scale);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  if (!video.videoWidth) return;
  const transform = videoTransform(video, canvas);
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
  const cx = transform.x + pose.centerX * transform.width;
  const cy = transform.y + pose.centerY * transform.height;
  const rx = pose.width * transform.width * 0.55;
  const ry = pose.height * transform.height * 0.58;
  context.lineWidth = Math.max(1.5, 1.3 * scale);
  context.strokeStyle = "rgba(157,248,200,.82)";
  context.beginPath(); context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); context.stroke();
  context.save(); context.translate(cx, cy); context.rotate(pose.roll * Math.PI / 180);
  context.strokeStyle = "rgba(98,180,255,.85)";
  context.beginPath(); context.moveTo(-rx, 0); context.lineTo(rx, 0); context.stroke();
  context.strokeStyle = "rgba(255,190,105,.85)";
  context.beginPath(); context.moveTo(0, -ry); context.lineTo(0, ry); context.stroke();
  context.strokeStyle = "rgba(220,151,255,.82)";
  context.beginPath(); context.ellipse(0, 0, Math.max(5, rx * Math.cos(Math.min(1.35, Math.abs(pose.yaw) * Math.PI / 180))), ry, 0, -Math.PI / 2, Math.PI / 2); context.stroke();
  context.restore();
}
