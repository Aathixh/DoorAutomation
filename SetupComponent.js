import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Button,
  Alert,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
  Linking,
  BackHandler,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WifiManager from 'react-native-wifi-reborn';
import {useNavigation} from '@react-navigation/native';
const TIMEOUT_DURATION = 20000;

const SetupComponent = () => {
  const navigation = useNavigation();
  const [networks, setNetworks] = useState([]);
  const [selectedNetwork, setSelectedNetwork] = useState(null);
  const [password, setPassword] = useState('');
  const [isConnectedToESP32, setIsConnectedToESP32] = useState(false);
  const [homeNetworks, setHomeNetworks] = useState([]);
  const [homeNetwork, setHomeNetwork] = useState(null);
  const [homePassword, setHomePassword] = useState('');

  const [isScanningNetworks, setIsScanningNetworks] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSendingCredentials, setIsSendingCredentials] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // const [isEnablingWifi, setIsEnablingWifi] = useState(false);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (isConnecting || isSendingCredentials) {
          Alert.alert(
            'Operation in Progress',
            'Please wait for the current operation to complete.',
          );
          return true;
        }
        return false;
      },
    );

    return () => backHandler.remove();
  }, [isConnecting, isSendingCredentials]);

  const checkWifiStatus = useCallback(async () => {
    try {
      const isEnabled = await WifiManager.isEnabled();
      if (!isEnabled) {
        Alert.alert(
          'Wi-Fi Disabled',
          'Wi-Fi needs to be enabled to connect to ESP32. Would you like to enable it now?',
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Enable Wi-Fi',
              onPress: async () => {
                try {
                  await WifiManager.setEnabled(true);
                } catch (error) {
                  Alert.alert(
                    'Manual Action Required',
                    'Unable to enable Wi-Fi automatically. Please enable Wi-Fi in your device settings.',
                    [
                      {text: 'Cancel', style: 'cancel'},
                      {
                        text: 'Open Settings',
                        onPress: () => Linking.openSettings(),
                      },
                    ],
                  );
                }
              },
            },
          ],
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error checking Wi-Fi status:', error);
      return false;
    }
  }, []);

  const checkLocationStatus = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const isEnabled = await WifiManager.isLocationEnabled();
        if (!isEnabled) {
          Alert.alert(
            'Location Services Disabled',
            'Location services must be enabled to scan for Wi-Fi networks on Android devices.',
            [
              {text: 'Cancel', style: 'cancel'},
              {text: 'Open Settings', onPress: () => Linking.openSettings()},
            ],
          );
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error('Error checking location status:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    const initializeSetup = async () => {
      setIsInitializing(true);
      try {
        const locationGranted = await requestLocationPermission();
        if (!locationGranted) {
          Alert.alert(
            'Permission Required',
            'Location permission is required to scan for Wi-Fi networks. Please grant permission in app settings.',
            [
              {text: 'Cancel', style: 'cancel'},
              {text: 'Open Settings', onPress: () => Linking.openSettings()},
            ],
          );
          return;
        }

        const wifiEnabled = await checkWifiStatus();
        if (!wifiEnabled) {
          return;
        }

        const locationEnabled = await checkLocationStatus();
        if (!locationEnabled) {
          return;
        }

        await scanForNetworks();
      } catch (error) {
        console.error('Setup initialization error:', error);
        Alert.alert(
          'Setup Error',
          'Failed to initialize setup. Please check your device settings and try again.',
        );
      } finally {
        setIsInitializing(false);
      }
    };
    initializeSetup();
  }, [
    enableWifi,
    scanForNetworks,
    checkWifiStatus,
    checkLocationStatus,
    requestLocationPermission,
  ]);

  const requestLocationPermission = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.requestMultiple(
          [
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.CHANGE_WIFI_STATE,
            PermissionsAndroid.PERMISSIONS.ACCESS_WIFI_STATE,
          ],
          {
            title: 'Location Permission',
            message:
              'We need access to your location to scan for Wi-Fi networks.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        const allGranted = Object.values(granted).every(
          permission => permission === PermissionsAndroid.RESULTS.GRANTED,
        );
        return allGranted;
      }
      return true;
    } catch (err) {
      console.warn(err);
      return false;
    }
  }, []);

  const enableWifi = useCallback(async () => {
    try {
      await WifiManager.setEnabled(true);
    } catch (error) {
      console.error('Error enabling Wi-Fi:', error);
      Alert.alert(
        'Wi-Fi Error',
        'Failed to enable Wi-Fi. Please enable it manually.',
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Retry', onPress: enableWifi},
        ],
      );
    }
  }, []);

  const scanForNetworks = useCallback(async () => {
    setIsScanningNetworks(true);
    try {
      const wifiNetworks = await WifiManager.loadWifiList();
      console.log('Detected Wi-Fi networks:', wifiNetworks);
      setNetworks(wifiNetworks);
    } catch (error) {
      console.error('Error scanning for networks:', error);
      Alert.alert(
        'Error',
        'Failed to scan for networks.Please enable Wifi and Location',
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Retry', onPress: scanForNetworks},
        ],
      );
    } finally {
      setIsScanningNetworks(false);
    }
  }, []);

  const connectToESP32 = useCallback(async () => {
    if (!selectedNetwork || !password) {
      Alert.alert('Error', 'Please select a network and enter a password');
      return;
    }
    setIsConnecting(true);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Connection timeout')),
        TIMEOUT_DURATION,
      ),
    );
    try {
      await Promise.race([
        WifiManager.connectToProtectedSSID(
          selectedNetwork.SSID,
          password,
          false,
          false,
        ),
        timeoutPromise,
      ]);

      console.log('Connected to', selectedNetwork.SSID);
      Alert.alert('Success', `Connected to ${selectedNetwork.SSID}`);
      setIsConnectedToESP32(true);
      await scanForHomeNetworks();
    } catch (error) {
      console.error('Error connecting to network:', error);
      if (error.message === 'Connection timeout') {
        // Handle timeout specifically
      } else {
        Alert.alert(
          'Connection Error',
          error.message === 'Connection timeout'
            ? 'Connection attempt timed out. Please try again.'
            : 'Failed to connect to network. Please check your password and try again.',
          [
            {text: 'Cancel', style: 'cancel'},
            {text: 'Retry', onPress: connectToESP32},
          ],
        );
      }
    } finally {
      setIsConnecting(false);
    }
  }, [selectedNetwork, password, scanForHomeNetworks]);

  const scanForHomeNetworks = useCallback(async () => {
    setIsScanningNetworks(true);
    try {
      const wifiNetworks = await WifiManager.loadWifiList();
      console.log('Detected home Wi-Fi networks:', wifiNetworks);
      setHomeNetworks(wifiNetworks);
    } catch (error) {
      console.error('Error scanning for home networks:', error);
      Alert.alert('Error', 'Failed to scan for home networks', [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Retry', onPress: scanForHomeNetworks},
      ]);
    } finally {
      setIsScanningNetworks(false);
    }
  }, []);

  const waitForESP32Connection = useCallback(async ipAddress => {
    const url = `http://${ipAddress}/ping`;
    console.log('Waiting for ESP32 connection:', url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_DURATION);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/plain',
        },
        signal: controller.signal,
      });
      console.log('ping: ', await response.text());
      clearTimeout(timeoutId);

      if (response.ok) {
        return true;
      } else {
        throw new Error('ESP32 not connected to home Wi-Fi');
      }
    } catch (error) {
      console.error('Error waiting for ESP32 connection:', error);
      return false;
    }
  }, []);

  const sendCredentialsToESP32 = useCallback(async () => {
    if (!homeNetwork || !homePassword) {
      Alert.alert('Error', 'Please select a home network and enter a password');
      return;
    }

    setIsSendingCredentials(true);
    let responseText = '';

    try {
      const url = `http://192.168.4.1/setup?ssid=${encodeURIComponent(
        homeNetwork.SSID,
      )}&password=${encodeURIComponent(homePassword)}`;

      console.log('Sending request to:', url);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_DURATION);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/plain',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      responseText = await response.text();
      console.log('Response:', responseText);

      const ipAddressMatch = responseText.match(/\s*(\d+\.\d+\.\d+\.\d+)/);
      console.log('IP address match:', ipAddressMatch);
      if (responseText.includes('Credentials received')) {
        const newIpAddress = ipAddressMatch[1];
        console.log('New IP address:', newIpAddress);
        await AsyncStorage.setItem(
          'esp32_connection',
          JSON.stringify({
            ssid: homeNetwork.SSID,
            password: homePassword,
            ipAddress: newIpAddress,
          }),
        );

        Alert.alert('Success', 'Home Wi-Fi credentials sent to ESP32', [
          {
            text: 'OK',
            onPress: async () => {
              try {
                // Reconnect app to home Wi-Fi
                await WifiManager.connectToProtectedSSID(
                  homeNetwork.SSID,
                  homePassword,
                  false,
                  false,
                );
                // Verify connection to home Wi-Fi
                const connectedSSID = await WifiManager.getCurrentWifiSSID();
                if (connectedSSID === homeNetwork.SSID) {
                  // Wait for ESP32 to connect to home Wi-Fi
                  const isConnected = await waitForESP32Connection(
                    newIpAddress,
                  );
                  if (isConnected) {
                    // Navigate to Main screen
                    navigation.navigate('Main', {
                      espIpAddress: newIpAddress,
                      ssid: homeNetwork.SSID,
                      password: homePassword,
                    });
                  } else {
                    Alert.alert(
                      'Connection Error',
                      'Failed to connect to ESP32 on home Wi-Fi. Please try again.',
                    );
                  }
                } else {
                  throw new Error('Failed to reconnect to home Wi-Fi');
                }
              } catch (error) {
                console.error('Error sending credentials to ESP32:', error);
                Alert.alert(
                  'Connection Error',
                  'Failed to reconnect to home Wi-Fi. Please try again.',
                );
              }
            },
          },
        ]);
      } else {
        throw new Error('Invalid response from ESP32');
      }
    } catch (error) {
      console.error('Error sending credentials to ESP32:', error);

      if (responseText && responseText.includes('Credentials received')) {
        const ipAddressMatch = responseText.match(/\s*(\d+\.\d+\.\d+\.\d+)/);
        Alert.alert('Success', 'Credentials likely sent successfully', [
          {
            text: 'OK',
            onPress: async () => {
              // Wait for ESP32 to connect to home Wi-Fi
              const isConnected = await waitForESP32Connection();
              if (isConnected) {
                // Reconnect app to home Wi-Fi
                await WifiManager.connectToProtectedSSID(
                  homeNetwork.SSID,
                  homePassword,
                  false,
                  false,
                );

                // Navigate to Main screen
                navigation.navigate('Main', {
                  espIpAddress: ipAddressMatch[1],
                  ssid: homeNetwork.SSID,
                  password: homePassword,
                });
              } else {
                Alert.alert(
                  'Connection Error',
                  'Failed to connect to ESP32 on home Wi-Fi. Please try again.',
                );
              }
            },
          },
        ]);
      } else {
        Alert.alert('Connection Error', 'Failed to send credentials', [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Try Again', onPress: sendCredentialsToESP32},
        ]);
      }
    } finally {
      setIsSendingCredentials(false);
    }
  }, [homeNetwork, homePassword, navigation, waitForESP32Connection]);

  const getSignalStrengthStyle = level => {
    if (level >= -50) {
      return styles.signalStrengthExcellent;
    }
    if (level >= -60) {
      return styles.signalStrengthGood;
    }
    if (level >= -70) {
      return styles.signalStrengthFair;
    }
    return styles.signalStrengthPoor;
  };

  const getSignalStrength = level => {
    if (level >= -50) {
      return '📶 Excellent';
    }
    if (level >= -60) {
      return '📶 Good';
    }
    if (level >= -70) {
      return '📶 Fair';
    }
    return '📶 Poor';
  };

  const renderNetworkItem = ({item}) => (
    <TouchableOpacity
      style={[
        styles.networkItem,
        item.level && getSignalStrengthStyle(item.level),
      ]}
      onPress={() => setSelectedNetwork(item)}>
      <Text style={styles.networkText}>{item.SSID}</Text>
      <Text style={styles.signalStrength}>{getSignalStrength(item.level)}</Text>
    </TouchableOpacity>
  );

  const renderHomeNetworkItem = ({item}) => (
    <TouchableOpacity
      style={styles.networkItem}
      onPress={() => setHomeNetwork(item)}>
      <Text style={styles.networkText}>{item.SSID}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {isInitializing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>Initializing...</Text>
        </View>
      ) : !isConnectedToESP32 ? (
        <>
          <Text style={styles.title}>Available Networks</Text>
          {isScanningNetworks ? (
            <View>
              <ActivityIndicator size="large" color="#0000ff" />
              <Text style={styles.loadingText}>Scanning networks...</Text>
            </View>
          ) : (
            <FlatList
              data={networks}
              keyExtractor={item => item.BSSID}
              renderItem={renderNetworkItem}
              style={styles.networkList}
              refreshing={isScanningNetworks}
              onRefresh={scanForNetworks}
            />
          )}

          {selectedNetwork && (
            <View style={styles.passwordContainer}>
              <Text style={styles.selectedNetworkText}>
                Selected Network: {selectedNetwork.SSID}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Enter Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!isConnecting}
              />
              {isConnecting ? (
                <ActivityIndicator size="small" color="#0000ff" />
              ) : (
                <Button
                  title="Connect"
                  onPress={connectToESP32}
                  disabled={isConnecting}
                />
              )}
            </View>
          )}
        </>
      ) : (
        <>
          <Text style={styles.title}>Home Networks</Text>
          {isScanningNetworks ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0000ff" />
              <Text style={styles.loadingText}>Scanning home networks...</Text>
            </View>
          ) : (
            <FlatList
              data={homeNetworks}
              keyExtractor={item => item.BSSID}
              renderItem={renderHomeNetworkItem}
              style={styles.networkList}
              refreshing={isScanningNetworks}
              onRefresh={scanForHomeNetworks}
            />
          )}
          {homeNetwork && (
            <View style={styles.passwordContainer}>
              <Text style={styles.selectedNetworkText}>
                Selected Home Network: {homeNetwork.SSID}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  isSendingCredentials && styles.inputDisabled,
                ]}
                placeholder="Enter Password"
                value={homePassword}
                onChangeText={setHomePassword}
                secureTextEntry
                editable={!isSendingCredentials}
              />
              {isSendingCredentials ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#0000ff" />
                  <Text style={styles.loadingText}>Sending credentials...</Text>
                </View>
              ) : (
                <Button
                  title="Send Credentials"
                  onPress={sendCredentialsToESP32}
                  disabled={isSendingCredentials}
                />
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  networkList: {
    marginBottom: 20,
  },
  networkItem: {
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  networkText: {
    fontSize: 18,
  },
  passwordContainer: {
    marginTop: 20,
  },
  selectedNetworkText: {
    fontSize: 18,
    marginBottom: 10,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 10,
    paddingLeft: 10,
  },
  inputDisabled: {
    backgroundColor: '#f0f0f0',
    opacity: 0.7,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 16,
  },
  signalStrengthExcellent: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  signalStrengthGood: {
    borderLeftWidth: 4,
    borderLeftColor: '#8BC34A',
  },
  signalStrengthFair: {
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  signalStrengthPoor: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF5722',
  },
});

export default SetupComponent;
