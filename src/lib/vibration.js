// Utilitaire de retour haptique (vibration)
export function vibrateLight() {
  if (navigator.vibrate) {
    navigator.vibrate(30);
  }
}

export function vibrateMedium() {
  if (navigator.vibrate) {
    navigator.vibrate([40, 20, 40]);
  }
}

export function vibrateSuccess() {
  if (navigator.vibrate) {
    navigator.vibrate([20, 10, 60]);
  }
}

export function vibrateError() {
  if (navigator.vibrate) {
    navigator.vibrate([80, 30, 80]);
  }
}