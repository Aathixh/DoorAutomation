import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import MainScreen from './MainScreen';
import SetupComponent from './SetupComponent.js';
import {enableScreens} from 'react-native-screens';
enableScreens();
const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Main">
        <Stack.Screen
          name="Main"
          component={MainScreen}
          options={{title: 'Main Screen'}}
        />
        <Stack.Screen
          name="SetupComponent"
          component={SetupComponent}
          options={{title: 'Setup'}}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
