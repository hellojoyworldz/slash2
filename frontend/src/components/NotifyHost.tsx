import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogRequest, registerDialogListener } from '../notify';
import { Dialog } from './Dialog';

// 루트에 한 번 마운트. notify()/confirmDialog() 호출을 받아 모달로 띄운다.
export function NotifyHost() {
  const { t } = useTranslation();
  // 내용(req)과 표시여부(visible)를 분리한다. 닫을 때 내용을 바로 비우면
  // 페이드아웃 애니메이션 도는 동안 빈 카드가 보이므로, 내용은 그대로 두고
  // visible만 끈다. 다음 호출이 오면 그때 내용을 교체.
  const [req, setReq] = useState<DialogRequest | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(
    () =>
      registerDialogListener((next) => {
        setReq(next);
        setVisible(true);
      }),
    [],
  );

  const close = (ok: boolean) => {
    req?.resolve?.(ok);
    setVisible(false); // 내용(req)은 유지 → 페이드아웃 중 글씨 안 사라짐
  };

  return (
    <Dialog
      visible={visible}
      title={req?.title ?? ''}
      message={req?.message}
      confirmLabel={req?.confirmLabel ?? t('common.confirm')}
      // resolve가 있으면 확인형 → 취소 버튼 노출.
      cancelLabel={req?.resolve ? (req?.cancelLabel ?? t('common.cancel')) : undefined}
      destructive={req?.destructive}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );
}
