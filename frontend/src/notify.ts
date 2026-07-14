// 앱 전역 다이얼로그 store. 컴포넌트가 아닌 곳(api 콜백 등)에서도
// notify()/confirmDialog()를 부를 수 있도록 모듈 레벨 리스너로 연결한다.
// 실제 UI는 <NotifyHost/>(루트에 마운트)가 <Dialog/>로 렌더한다.

export interface DialogRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  // 확인형이면 예(true)/아니오(false)를 돌려준다. 알림형은 없음.
  resolve?: (ok: boolean) => void;
}

let listener: ((req: DialogRequest) => void) | null = null;

export function registerDialogListener(fn: (req: DialogRequest) => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

// 알림 (버튼 1개). 예전 Alert.alert / window.alert 대체.
export function notify(title: string, message?: string): void {
  listener?.({ title, message });
}

// 확인 (취소/확인 2개) → Promise<boolean>. 예전 window.confirm 대체.
export function confirmDialog(opts: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) {
      resolve(false);
      return;
    }
    listener({ ...opts, resolve });
  });
}
