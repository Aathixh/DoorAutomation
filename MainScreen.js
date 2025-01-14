/* eslint-disable react-native/no-inline-styles */
import React, {useState, useEffect, useCallback} from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  Button,
  Alert,
  ActivityIndicator,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WifiManager from 'react-native-wifi-reborn';
import {openSettings} from 'react-native-permissions';

const MainScreen = ({navigation, route}) => {
  const [doorState, setDoorState] = useState('closed');
  const [espIpAddress, setEspIpAddress] = useState('192.168.4.1'); // Default ESP32 AP IP
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [isSetupComplete, setIsSetupComplete] = useState(false);

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.match(/inactive|background/) &&
        nextAppState === 'inactive'
      ) {
        console.log('App has come to the foreground!');
        handleAppResume();
      }
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, [appState, handleAppResume]);

  // Check connection periodically
  useEffect(() => {
    if (isConnected || isSetupComplete) {
      console.log('Connection is stable; skipping reconnection checks.');
      return;
    }

    let intervalId = setInterval(async () => {
      const connected = await checkConnection();
      if (connected) {
        clearInterval(intervalId);
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(intervalId);
  }, [isConnected, isSetupComplete, checkConnection]);

  const checkConnection = useCallback(async () => {
    try {
      console.log('Pinging ESP32 at:', espIpAddress);
      const response = await fetch(`http://${espIpAddress}/ping`, {
        method: 'GET',
        timeout: 5000,
      });
      console.log('hi', response);

      if (response.ok) {
        setIsConnected(true);
        return true;
      } else {
        setIsConnected(false);
        throw new Error('Connection check failed');
      }
    } catch (error) {
      console.log('Connection check failed:', error);
      setIsConnected(false);
      await handleConnectionLost();
      return false;
    }
  }, [espIpAddress, handleConnectionLost]);

  const handleAppResume = useCallback(async () => {
    console.log('Handling app resume...');
    const savedDetails = await AsyncStorage.getItem('esp32_connection');
    if (savedDetails) {
      const {ssid, password} = JSON.parse(savedDetails);
      await reconnectToNetwork(ssid, password);
    }
  }, [reconnectToNetwork]);

  const reconnectToNetwork = useCallback(
    async (ssid, password) => {
      if (isSetupComplete) {
        console.log('Reconnection skipped as setup is complete.');
        return true;
      }
      try {
        await WifiManager.connectToProtectedSSID(ssid, password, false, false);
        // Check current connection first
        const currentSSID = await WifiManager.getCurrentWifiSSID();
        console.log('Current SSID:', currentSSID, 'Target SSID:', ssid);

        if (currentSSID === ssid) {
          console.log('Reconnected to:', ssid);
          setIsConnected(true);
          setIsSetupComplete(true);
          console.log();
          return true;
        }
        // Fallback to manual selection if programmatic connection fails
        throw new Error('Programmatic connection failed');
      } catch (error) {
        console.error('Error reconnecting to network:', error);
        Alert.alert(
          'Connection Error',
          'Failed to reconnect to saved network. Please check your Wi-Fi settings.',
          [
            {text: 'OK'},
            {
              text: 'Setup Again',
              onPress: () => openSettings(),
            },
          ],
        );
        return false;
      }
    },
    [isSetupComplete],
  );

  const handleConnectionLost = useCallback(async () => {
    if (!isSetupComplete) {
      setIsConnected(false);
      const savedDetails = await AsyncStorage.getItem('esp32_connection');
      if (savedDetails) {
        const {ssid, password} = JSON.parse(savedDetails);
        try {
          const currentSSID = await WifiManager.getCurrentWifiSSID();
          if (currentSSID !== ssid) {
            await reconnectToNetwork(ssid, password);
          }
        } catch (error) {
          console.error('Error handling connection loss:', error);
        }
      }
    } else {
      console.log('Setup is complete; skipping reconnection attempts.');
    }
  }, [reconnectToNetwork, isSetupComplete]);

  useEffect(() => {
    let isMounted = true;
    const loadConnectionDetails = async () => {
      try {
        const savedDetails = await AsyncStorage.getItem('esp32_connection');
        const savedDoorState = await AsyncStorage.getItem('door_state');
        if (savedDetails && isMounted) {
          const {ssid, password, ipAddress} = JSON.parse(savedDetails);
          setEspIpAddress(ipAddress);
          // console.log(ipAddress);
          const connected = await reconnectToNetwork(ssid, password);
          if (!connected) {
            console.log('Failed to reconnect automatically');
          }
        }
        if (savedDoorState && isMounted) {
          setDoorState(savedDoorState);
        }
      } catch (error) {
        console.error('Error loading connection details:', error);
      }
    };

    loadConnectionDetails();
    return () => {
      isMounted = false;
    };
  }, [reconnectToNetwork]);

  // Update IP address when received from setup screen
  useEffect(() => {
    if (route.params?.espIpAddress) {
      setEspIpAddress(route.params.espIpAddress);
      setIsConnected(true);

      if (route.params?.ssid && route.params?.password) {
        AsyncStorage.setItem(
          'esp32_connection',
          JSON.stringify({
            ssid: route.params.ssid,
            password: route.params.password,
            ipAddress: route.params.espIpAddress,
          }),
        );
      }
    }
  }, [route.params]);

  const toggleDoor = async () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please setup connection with ESP32 first.');
      return;
    }

    setIsLoading(true);
    const url = `http://${espIpAddress}/${
      doorState === 'closed' ? 'open' : 'close'
    }`;
    console.log(espIpAddress);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/plain',
        },
        signal: controller.signal,
        timeout: 10000, // 5 second timeout
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Server responded with an error');
      }

      const result = await response.text();
      console.log(result);
      const newDoorState = doorState === 'closed' ? 'open' : 'closed';
      setDoorState(newDoorState);
      await AsyncStorage.setItem('door_state', newDoorState);
    } catch (error) {
      console.error('Error:', error);

      // Existing error handling
      Alert.alert(
        'Connection Error',
        'Failed to control door. Please verify your connection and try again.',
        [
          {text: 'OK'},
          {
            text: 'Reconnect',
            onPress: () => navigation.navigate('SetupComponent'),
          },
        ],
      );
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.title}>
        <Text style={styles.titleText}>PROJECT LOCK</Text>
        <Text style={styles.statusText}>
          {isConnected ? 'Connected' : 'Not Connected'}
        </Text>
      </View>
      <View
        style={[
          styles.outerCircle,
          {borderColor: doorState === 'closed' ? 'green' : 'red'},
        ]}>
        <TouchableOpacity
          style={[styles.button, !isConnected && styles.buttonDisabled]}
          onPress={toggleDoor}
          disabled={isLoading || !isConnected}>
          {isLoading ? (
            <ActivityIndicator size="large" color="#000" />
          ) : (
            <Text style={styles.buttonText}>
              {doorState === 'closed' ? 'Open Door' : 'Close Door'}
            </Text>
          )}
        </TouchableOpacity>
        <View
          style={[
            styles.led,
            {backgroundColor: doorState === 'closed' ? 'green' : 'red'},
          ]}
        />
      </View>
      <Button
        title={isConnected ? 'Reconfigure ESP32' : 'Setup ESP32'}
        onPress={() => navigation.navigate('SetupComponent')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#d1d5de',
  },
  title: {
    position: 'absolute',
    top: 70,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#666',
  },
  titleText: {
    fontSize: 38,
    fontWeight: '800',
  },
  outerCircle: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderRadius: 110,
    width: 280,
    height: 280,
    backgroundColor: 'transparent',
  },
  button: {
    width: 250,
    height: 250,
    borderRadius: 100,
    backgroundColor: '#ffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#000',
    fontSize: 35,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  led: {
    position: 'absolute',
    top: 200,
    width: 35,
    height: 10,
    borderRadius: 10,
  },
});

export default MainScreen;
