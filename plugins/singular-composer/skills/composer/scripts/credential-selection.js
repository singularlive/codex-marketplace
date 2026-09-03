function pairedAtTime(credentials) {
  const value = credentials && new Date(credentials.pairedAt).getTime();
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function isCompleteCredential(credentials) {
  return Boolean(
    credentials &&
    credentials.server &&
    credentials.accessToken &&
    credentials.socketPath
  );
}

function selectNewestCredentialCandidate(candidates) {
  let selected = null;
  candidates.forEach(function (candidate) {
    if (!candidate || !isCompleteCredential(candidate.credentials)) return;
    if (!selected || pairedAtTime(candidate.credentials) > pairedAtTime(selected.credentials)) {
      selected = candidate;
    }
  });
  return selected;
}

module.exports = {
  isCompleteCredential,
  pairedAtTime,
  selectNewestCredentialCandidate
};
