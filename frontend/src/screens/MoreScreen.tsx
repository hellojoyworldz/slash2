import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button } from '../components/Button';
import { Text } from '../components/Text';
import {
  LANGUAGE_NAMES,
  Language,
  setLanguage,
  SUPPORTED_LANGUAGES,
} from '../i18n';
import { colors, layout } from '../theme';

interface Props {
  email: string;
  displayName: string | null;
  onRename: (name: string) => Promise<void>;
  onLogout: () => void;
}

export function MoreScreen({ email, displayName, onRename, onLogout }: Props) {
  const { t, i18n } = useTranslation();
  const current = i18n.language as Language;
  // 표시 이름이 없으면 이메일 앞부분으로 폴백
  const name = displayName || email.split('@')[0] || t('common.me');

  const [modalOpen, setModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const openModal = () => {
    setNameInput(displayName ?? '');
    setFormError('');
    setModalOpen(true);
  };

  const save = async () => {
    const next = nameInput.trim();
    if (!next) {
      setFormError(t('more.nameRequired'));
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await onRename(next);
      setModalOpen(false);
    } catch {
      setFormError(t('errors.requestFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="title">{t('more.title')}</Text>
      </View>

      {/* 프로필 — 누르면 이름 변경 */}
      <TouchableOpacity
        style={styles.profileRow}
        onPress={openModal}
        activeOpacity={0.6}
        accessibilityRole="button"
      >
        <View style={styles.avatar}>
          <Text variant="heading" color={colors.inverse}>
            {name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text variant="heading">{name}</Text>
          <Text
            variant="label"
            color={colors.textSecondary}
            style={styles.profileEmail}
          >
            {email || t('more.needLogin')}
          </Text>
        </View>
        <Text variant="label" color={colors.textTertiary}>
          {t('more.editName')}
        </Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      {/* 언어 스위처 — 기기 언어 자동 감지에 더해 수동 선택 */}
      <Text variant="caption" color={colors.textTertiary} style={styles.sectionLabel}>
        {t('more.language')}
      </Text>
      <View style={styles.langRow}>
        {SUPPORTED_LANGUAGES.map((lang) => {
          const active = current === lang;
          return (
            <TouchableOpacity
              key={lang}
              style={[styles.langPill, active && styles.langPillActive]}
              onPress={() => void setLanguage(lang)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              hitSlop={{ top: 6, bottom: 6 }}
            >
              <Text
                variant="label"
                color={active ? colors.inverse : colors.textSecondary}
              >
                {LANGUAGE_NAMES[lang]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 보조 액션이라 outline */}
      <Button
        label={t('more.logout')}
        variant="outline"
        onPress={onLogout}
        style={styles.logoutBtn}
      />

      {/* 이름 변경 모달 */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text variant="heading">{t('more.editName')}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={t('more.namePlaceholder')}
              placeholderTextColor={colors.textTertiary}
              value={nameInput}
              onChangeText={(text) => {
                setNameInput(text);
                if (formError) setFormError('');
              }}
              maxLength={30}
              autoFocus
              onSubmitEditing={save}
            />
            {formError ? (
              <Text variant="caption" color={colors.textSecondary} style={styles.modalError}>
                {formError}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Button
                label={t('common.cancel')}
                variant="ghost"
                onPress={() => setModalOpen(false)}
                disabled={saving}
                style={styles.modalButton}
              />
              <Button
                label={t('more.save')}
                onPress={save}
                loading={saving}
                style={styles.modalButton}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: layout.statusBarPad + 4,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 21,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  profileEmail: {
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginHorizontal: 20,
    marginTop: 8,
  },
  sectionLabel: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  langRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
  },
  langPill: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  langPillActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  logoutBtn: {
    marginHorizontal: 20,
    marginTop: 28,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.background,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
  },
  modalInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: 14,
  },
  modalError: {
    marginTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 16,
  },
  modalButton: {
    height: 44,
    minWidth: 88,
  },
});
