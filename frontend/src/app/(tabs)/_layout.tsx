import { TabList, TabSlot, Tabs, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout } from '../../theme';

// 하단 탭바 — 흑백 라인 스타일
const TabButton = forwardRef<View, TabTriggerSlotProps & { label: string }>(
  function TabButton({ label, isFocused, ...props }, ref) {
    return (
      <Pressable ref={ref} {...props} style={styles.tabItem}>
        <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
          {label}
        </Text>
      </Pressable>
    );
  },
);

export default function TabsLayout() {
  return (
    <Tabs style={styles.container}>
      <TabSlot />
      <TabList style={styles.tabBar}>
        <TabTrigger name="friends" href="/friends" asChild>
          <TabButton label="친구" />
        </TabTrigger>
        <TabTrigger name="chats" href="/chats" asChild>
          <TabButton label="채팅" />
        </TabTrigger>
        <TabTrigger name="more" href="/more" asChild>
          <TabButton label="더보기" />
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
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  tabLabelActive: {
    color: colors.ink,
    fontWeight: '800',
  },
});
