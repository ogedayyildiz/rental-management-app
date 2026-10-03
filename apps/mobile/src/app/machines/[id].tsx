import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { api, type MachineDetail, type MaintenancePlan } from '@/lib/api';
import { formatMoney, STATUS_COLOR, STATUS_LABEL, timeAgo } from '@/lib/format';
import { useLiveMachines } from '@/lib/live';

export default function MachineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useTheme();
  const detail = useQuery({ queryKey: ['machine', id], queryFn: () => api<MachineDetail>(`/machines/${id}`) });
  const plans = useQuery({
    queryKey: ['maintenance', id],
    queryFn: () => api<MaintenancePlan[]>(`/maintenance/plans?machineId=${id}`),
  });
  const live = useLiveMachines().data?.find((m) => m.id === id);

  if (!detail.data) return <ActivityIndicator style={{ flex: 1 }} />;
  const m = { ...detail.data, ...live };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: m.name }} />

      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        <Row label="Status" value={STATUS_LABEL[m.status]} color={STATUS_COLOR[m.status]} />
        <Row label="Model" value={`${m.manufacturer} ${m.model}`} />
        <Row label="Serial" value={m.serialNo} />
        {m.device && <Row label="GPS device" value={m.device.externalId} />}
      </View>

      <Text style={[styles.section, { color: colors.textSecondary }]}>LIVE</Text>
      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        <Row label="Last seen" value={timeAgo(m.lastSeenAt)} />
        <Row label="Battery" value={m.batterySoc != null ? `${Math.round(m.batterySoc)}%` : '—'} />
        <Row label="Engine hours" value={m.engineHours?.toFixed(1) ?? '—'} />
        <Row label="Ignition" value={m.ignition == null ? '—' : m.ignition ? 'On' : 'Off'} />
        <Row
          label="Active errors"
          value={m.activeErrorCodes.length ? m.activeErrorCodes.join(', ') : 'None'}
          color={m.activeErrorCodes.length ? '#dc2626' : undefined}
        />
      </View>

      <Text style={[styles.section, { color: colors.textSecondary }]}>RENTAL</Text>
      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        {m.currentRental ? (
          <>
            <Row label="Contract" value={m.currentRental.contractNo} />
            <Row label="Since" value={new Date(m.currentRental.startAt).toLocaleDateString()} />
            {m.currentRental.plannedEndDate && <Row label="Until" value={m.currentRental.plannedEndDate} />}
          </>
        ) : (
          <Text style={{ color: colors.textSecondary }}>Not on rent</Text>
        )}
        <Row label="Revenue earned" value={formatMoney(m.stats.revenueEarned)} />
        <Row label="Errors (30 days)" value={String(m.stats.errors30d)} />
      </View>

      <Text style={[styles.section, { color: colors.textSecondary }]}>MAINTENANCE</Text>
      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        {plans.data?.map((p) => (
          <Row
            key={p.planId}
            label={p.planName}
            value={
              p.hoursRemaining != null
                ? `${Math.round(p.hoursRemaining)} h left`
                : p.daysRemaining != null
                  ? `${p.daysRemaining} days left`
                  : '—'
            }
            color={p.status === 'overdue' ? '#dc2626' : p.status === 'due_soon' ? '#d97706' : undefined}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  const colors = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.textSecondary }}>{label}</Text>
      <Text style={{ color: color ?? colors.text, fontWeight: '500' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  card: { borderRadius: 12, padding: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  section: { fontSize: 12, marginTop: 12, marginLeft: 4 },
});
