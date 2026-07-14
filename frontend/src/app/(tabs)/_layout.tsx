import { Redirect } from 'expo-router';
import { TabList, TabSlot, Tabs, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '../../auth';
import { Text } from '../../components/Text';
import { colors, layout } from '../../theme';

// 하단 탭바 — 흑백 라인 스타일
const TabButton = forwardRef<View, TabTriggerSlotProps & { label: string }>(
  function TabButton({ label, isFocused, ...props }, ref) {
    return (
      <Pressable
        ref={ref}
        {...props}
        style={styles.tabItem}
        accessibilityRole="tab"
        accessibilityState={{ selected: !!isFocused }}
      >
        <Text
          variant="label"
          color={isFocused ? colors.ink : colors.textTertiary}
          style={isFocused && styles.tabLabelActive}
        >
          {label}
        </Text>
      </Pressable>
    );
  },
);

export default function TabsLayout() {
  const { token, emailVerified } = useAuth();
  const { t } = useTranslation();

  // 앱 내부는 로그인 + 이메일 인증을 마친 유저만 접근 가능.
  if (!token) return <Redirect href="/login" />;
  if (!emailVerified) return <Redirect href="/verify" />;

  return (
    <Tabs style={styles.container}>
      <TabSlot />
      <TabList style={styles.tabBar}>
        <TabTrigger name="friends" href="/friends" asChild>
          <TabButton label={t('tabs.friends')} />
        </TabTrigger>
        <TabTrigger name="chats" href="/chats" asChild>
          <TabButton label={t('tabs.chats')} />
        </TabTrigger>
        <TabTrigger name="more" href="/more" asChild>
          <TabButton label={t('tabs.more')} />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.background,
    paddingBottom: layout.bottomPad,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
  },
  tabLabelActive: {
    fontWeight: '800',
  },
});
