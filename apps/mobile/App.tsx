import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { translate } from '@rental/i18n';

export default function App() {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {translate('en', 'app.title')}
      </Text>
      <Text style={styles.description}>
        {translate('en', 'bootstrap.description')}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 28, fontWeight: '600', color: '#0f172a' },
  description: { marginTop: 16, fontSize: 16, color: '#475569' },
});
