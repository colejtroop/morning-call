const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function collectFaceMeasurementSamples(sessions, position = "face_front") {
  const samples = {};
  for (const session of sessions) {
    for (const capture of session.captures?.filter((item) => item.position === position) || []) {
      const values = capture?.face?.measurements?.values;
      if (!values) continue;
      for (const [metric, value] of Object.entries(values)) {
        if (Number.isFinite(value)) (samples[metric] ||= []).push(value);
      }
    }
  }
  return samples;
}

export function buildPersonalErrorModel(sessions, { minimumSamples = 5 } = {}) {
  const samples = collectFaceMeasurementSamples(sessions);
  const metrics = {};
  for (const [name, values] of Object.entries(samples)) {
    const baseline = median(values);
    const mad = median(values.map((value) => Math.abs(value - baseline)));
    const robustSigma = 1.4826 * mad;
    const relativeNoise = Math.abs(baseline) > 1e-9 ? robustSigma / Math.abs(baseline) : null;
    const ready = values.length >= minimumSamples;
    const reliability = !ready ? "insufficient" : relativeNoise <= 0.005 ? "high" : relativeNoise <= 0.015 ? "moderate" : "low";
    metrics[name] = { sampleCount: values.length, baseline, mad, robustSigma, relativeNoise, reliability, ready };
  }
  const readyMetrics = Object.values(metrics).filter((metric) => metric.ready);
  return {
    schemaVersion: 1,
    minimumSamples,
    sessionCount: sessions.length,
    ready: readyMetrics.length > 0,
    metrics
  };
}

export function compareToPersonalBaseline(value, metric, { sigmaThreshold = 2.5 } = {}) {
  if (!metric?.ready || !Number.isFinite(value)) return { status: "insufficient_data", confidence: "low" };
  const difference = value - metric.baseline;
  const threshold = Math.max(metric.robustSigma * sigmaThreshold, Math.abs(metric.baseline) * 0.0025);
  if (Math.abs(difference) <= threshold) return { status: "within_noise", difference, threshold, confidence: metric.reliability };
  return { status: difference > 0 ? "increased" : "decreased", difference, threshold, confidence: metric.reliability };
}

export function buildViewErrorModels(sessions) {
  return Object.fromEntries(["face_front","face_left","face_right","profile_left","profile_right"].map((view) => {
    const scoped = sessions.map((session) => ({ ...session, captures: session.captures?.filter((capture) => capture.position === view) || [] }));
    return [view, buildPersonalErrorModel(scoped)];
  }));
}

export function buildCaptureConditionModel(sessions, position = "face_front") {
  const widths = sessions.flatMap((session) => session.captures?.filter((capture) => capture.position === position).map((capture) => capture.face?.pose?.width).filter(Number.isFinite) || []);
  if (!widths.length) return { ready: false, sampleCount: 0 };
  const baseline = median(widths);
  const mad = median(widths.map((value) => Math.abs(value - baseline)));
  return { ready: widths.length >= 5, sampleCount: widths.length, baseline, tolerance: Math.max(1.4826 * mad * 2.5, baseline * 0.05) };
}

export function validateCaptureConditions(faceWidth, model) {
  if (!model?.ready || !Number.isFinite(faceWidth)) return { ok: true, status: "learning" };
  const difference = faceWidth - model.baseline;
  if (Math.abs(difference) <= model.tolerance) return { ok: true, status: "matched" };
  return { ok: false, status: difference > 0 ? "too_close" : "too_far", reason: difference > 0 ? "Move back to match your calibrated distance." : "Move closer to match your calibrated distance." };
}
