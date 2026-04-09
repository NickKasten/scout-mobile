import React, {useRef, useState} from 'react';
import {
  Animated,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  Alert,
  PanResponder,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

type Screen = 'login' | 'home' | 'signup' | 'profile';

const tokens = {
  colors: {
    background: '#0D0D0D',
    surface: '#1A1A1A',
    surfaceElevated: '#242424',
    primary: '#4A9EFF',
    text: '#F5F5F5',
    textSecondary: '#999',
    border: '#333',
    error: '#FF6B6B',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 40,
  },
  radii: {
    sm: 4,
    md: 8,
    lg: 12,
  },
  typography: {
    title: 28,
    body: 16,
    caption: 14,
  },
};

function App() {
  const [screen, setScreen] = useState<Screen>('login');

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.container}>
        {screen === 'login' && <LoginScreen onLogin={() => setScreen('home')} onSignUp={() => setScreen('signup')} />}
        {screen === 'home' && <HomeScreen onLogout={() => setScreen('login')} onProfile={() => setScreen('profile')} />}
        {screen === 'profile' && <ProfileScreen onBack={() => setScreen('home')} />}
        {screen === 'signup' && <SignUpScreen onBack={() => setScreen('login')} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function LoginScreen({onLogin, onSignUp}: {onLogin: () => void; onSignUp: () => void}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }
    console.log(`[ScoutTest] Login successful for: ${email}`);
    setError('');
    onLogin();
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Scout Test Login</Text>
      <Text style={styles.subtitle}>A test app for Scout MCP tools</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={tokens.colors.textSecondary}
        accessibilityLabel="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        returnKeyType="next"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={tokens.colors.textSecondary}
        accessibilityLabel="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        returnKeyType="done"
        onSubmitEditing={handleLogin}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleLogin}
        accessibilityLabel="Log In">
        <Text style={styles.buttonText}>Log In</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onSignUp} accessibilityLabel="Sign Up Here">
        <Text style={styles.link}>Don't have an account? Sign Up Here</Text>
      </TouchableOpacity>
    </View>
  );
}

const INITIAL_ITEMS = Array.from({length: 30}, (_, i) => ({
  id: String(i),
  title: `Item ${i + 1}`,
  description: `This is the description for item number ${i + 1}`,
}));

type Item = (typeof INITIAL_ITEMS)[number];

const SWIPE_THRESHOLD = 80;
const ACTION_WIDTH = 160;

function SwipeableCard({
  item,
  onDelete,
  onArchive,
}: {
  item: Item;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          Animated.spring(translateX, {
            toValue: -ACTION_WIDTH,
            useNativeDriver: true,
          }).start();
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <View style={styles.swipeContainer}>
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.archiveAction}
          onPress={() => {
            Animated.spring(translateX, {toValue: 0, useNativeDriver: true}).start();
            Alert.alert('Archived', `${item.title} has been archived`);
            onArchive(item.id);
          }}
          accessibilityLabel={`Archive ${item.title}`}>
          <Text style={styles.actionText}>Archive</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={() => onDelete(item.id)}
          accessibilityLabel={`Delete ${item.title}`}>
          <Text style={styles.actionText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        style={[styles.card, {transform: [{translateX}]}]}
        {...panResponder.panHandlers}>
        <TouchableOpacity
          onPress={() => Alert.alert(item.title, item.description)}
          accessibilityLabel={item.title}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardDescription}>{item.description}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function HomeScreen({onLogout, onProfile}: {onLogout: () => void; onProfile: () => void}) {
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [search, setSearch] = useState('');
  console.log('[ScoutTest] Home screen loaded');

  const filteredItems = search.trim()
    ? items.filter(item => {
        const q = search.toLowerCase();
        return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
      })
    : items;

  const handleDelete = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleArchive = (_id: string) => {
    // Archive is a no-op for now — just shows alert
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome!</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={onProfile}
            accessibilityLabel="Profile">
            <Text style={styles.link}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              console.log('[ScoutTest] User logged out');
              onLogout();
            }}
            accessibilityLabel="Log Out">
            <Text style={styles.link}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.subtitle}>Scroll through the items below</Text>

      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        style={styles.list}
        ListHeaderComponent={
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor={tokens.colors.textSecondary}
            accessibilityLabel="Search"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText} accessibilityLabel="No Results">
            No items match your search
          </Text>
        }
        renderItem={({item}) => (
          <SwipeableCard
            item={item}
            onDelete={handleDelete}
            onArchive={handleArchive}
          />
        )}
      />
    </View>
  );
}

function ProfileScreen({onBack}: {onBack: () => void}) {
  return (
    <View style={styles.screen}>
      <TouchableOpacity
        onPress={onBack}
        accessibilityLabel="Back to Home"
        style={styles.backButton}>
        <Text style={styles.link}>Back to Home</Text>
      </TouchableOpacity>

      <View style={styles.profileCenter}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>JD</Text>
        </View>
        <Text style={[styles.title, styles.profileName]} accessibilityLabel="Username">Jane Doe</Text>
        <Text style={styles.subtitle} accessibilityLabel="User Email">jane@example.com</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue} accessibilityLabel="42 Posts">42</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue} accessibilityLabel="1.2K Followers">1.2K</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue} accessibilityLabel="380 Following">380</Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
      </View>
    </View>
  );
}

function SignUpScreen({onBack}: {onBack: () => void}) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Sign Up</Text>
      <Text style={styles.subtitle}>This is a placeholder screen</Text>

      <TouchableOpacity
        style={[styles.button, styles.secondaryButton]}
        onPress={onBack}
        accessibilityLabel="Back to Login">
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Back to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  screen: {
    flex: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.xxl,
  },
  title: {
    fontSize: tokens.typography.title,
    fontWeight: 'bold',
    color: tokens.colors.text,
    marginBottom: tokens.spacing.sm,
  },
  subtitle: {
    fontSize: tokens.typography.body,
    color: tokens.colors.textSecondary,
    marginBottom: tokens.spacing.xl,
  },
  error: {
    color: tokens.colors.error,
    fontSize: tokens.typography.caption,
    marginBottom: tokens.spacing.md,
    textAlign: 'center',
  },
  input: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radii.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 12,
    fontSize: tokens.typography.body,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.md,
  },
  button: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: tokens.spacing.md,
  },
  buttonText: {
    color: '#fff',
    fontSize: tokens.typography.body,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.primary,
  },
  secondaryButtonText: {
    color: tokens.colors.primary,
  },
  link: {
    color: tokens.colors.primary,
    fontSize: tokens.typography.caption,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  list: {
    flex: 1,
  },
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radii.md,
    padding: tokens.spacing.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  cardTitle: {
    fontSize: tokens.typography.body,
    fontWeight: '600',
    color: tokens.colors.text,
    marginBottom: tokens.spacing.xs,
  },
  cardDescription: {
    fontSize: tokens.typography.caption,
    color: tokens.colors.textSecondary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  backButton: {
    marginBottom: tokens.spacing.lg,
  },
  profileCenter: {
    alignItems: 'center',
    marginBottom: tokens.spacing.xl,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: tokens.colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: tokens.spacing.md,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: tokens.colors.primary,
  },
  profileName: {
    textAlign: 'center',
    marginBottom: tokens.spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radii.md,
    padding: tokens.spacing.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: tokens.colors.text,
    marginBottom: tokens.spacing.xs,
  },
  statLabel: {
    fontSize: tokens.typography.caption,
    color: tokens.colors.textSecondary,
  },
  searchInput: {
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radii.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 12,
    fontSize: tokens.typography.body,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.md,
  },
  emptyText: {
    color: tokens.colors.textSecondary,
    fontSize: tokens.typography.body,
    textAlign: 'center',
    marginTop: tokens.spacing.xxl,
  },
  swipeContainer: {
    marginBottom: 12,
    borderRadius: tokens.radii.md,
    overflow: 'hidden',
  },
  actionsContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    flexDirection: 'row',
  },
  archiveAction: {
    flex: 1,
    backgroundColor: '#4A6572',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteAction: {
    flex: 1,
    backgroundColor: tokens.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    color: '#fff',
    fontSize: tokens.typography.caption,
    fontWeight: '600',
  },
});

export default App;
