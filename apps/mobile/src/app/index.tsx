import { MACHINE_STATUSES, type MachineStatus } from '@rental/shared';
import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import type { Machine } from '@/lib/api';
import { STATUS_COLOR, STATUS_LABEL, timeAgo } from '@/lib/format';
import { useLiveMachines } from '@/lib/live';

export default function MachinesScreen() {
  const colors = useTheme();
  const { data, error, isLoading, refetch, isRefetching } = useLiveMachines();
  const [status, setStatus] = useState<MachineStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      (m) =>
        (status === 'all' || m.status === status) &&
        (!q || `${m.name} ${m.serialNo} ${m.model}`.toLowerCase().includes(q)),
    );
  }, [data, search, status]);

  if (isLoading) return <ActivityIndicator style={styles.center} />;
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.text }}>Could not reach the API.</Text>
        <Text style={{ color: colors.textSecondary }}>{error.message}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(m) => m.id}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search machines"
            placeholderTextColor={colors.textSecondary}
            style={[styles.search, { color: colors.text, backgroundColor: colors.backgroundElement }]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {(['all', ...MACHINE_STATUSES] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[
                  styles.chip,
                  { backgroundColor: status === s ? colors.backgroundSelected : colors.backgroundElement },
                ]}>
                <Text style={{ color: colors.text }}>{s === 'all' ? 'All' : STATUS_LABEL[s]}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      }
      renderItem={({ item }) => <MachineRow machine={item} />}
      ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.backgroundElement }]} />}
    />
  );
}

function MachineRow({ machine: m }: { machine: Machine }) {
  const colors = useTheme();
  return (
    <Link href={{ pathname: '/machines/[id]', params: { id: m.id } }} asChild>
      <Pressable style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]}>
            {m.name}
            {m.activeErrorCodes.length > 0 && <Text style={styles.error}>  ● {m.activeErrorCodes.join(', ')}</Text>}
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            {m.manufacturer} {m.model} · {timeAgo(m.lastSeenAt)}
          </Text>
        </View>
        <View style={styles.right}>
          <View style={styles.status}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLOR[m.status] }]} />
            <Text style={{ color: colors.text }}>{STATUS_LABEL[m.status]}</Text>
          </View>
          <Text style={{ color: colors.textSecondary }}>
            {m.batterySoc != null ? `${Math.round(m.batterySoc)}%` : '—'}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  header: { padding: 16, gap: 12 },
  search: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  chips: { gap: 8 },
  chip: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  name: { fontSize: 16, fontWeight: '600' },
  error: { color: '#dc2626', fontWeight: '400', fontSize: 13 },
  right: { alignItems: 'flex-end', gap: 2 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
});
