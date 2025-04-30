import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Feather } from '@expo/vector-icons';
import RecordingModal from '../components/Modals/RecordingModal';
import ConfirmModal from '../components/Modals/ConfirmModal';
import { useToast } from '../components/StatusToast';
import useAudioRecorder from '../hooks/useAudioRecorder';
import { cloneVoice } from '../services/voiceService';
import voiceService from '../services/voiceService'; 
import { COLORS } from '../styles/colors';

export default function CloneScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  
  // State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasExistingVoice, setHasExistingVoice] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [progressData, setProgressData] = useState({ progress: 0, status: '' });
  
  // Reference for handling abort operations
  const abortControllerRef = useRef(null);
  
  // Audio recorder hook
  const {
    isRecording,
    startRecording,
    stopRecording,
    recordingDuration,
    formatDuration,
    audioUri,
    progress,
    handleAudioFileUpload,
  } = useAudioRecorder();
  
  // Check for existing voice clone and network status on mount
  useEffect(() => {
    checkExistingVoice();
    setupNetworkListener();
    
    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  
  // Set up network status listener
  const setupNetworkListener = () => {
    // Check initial status
    NetInfo.fetch().then(state => {
      setIsOnline(state.isConnected === true);
    });
    
    // Subscribe to network changes
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected === true);
    });
    
    return () => unsubscribe();
  };
  
  // Check if user has an existing voice clone
  const checkExistingVoice = async () => {
    try {
      // Use the new verification function
      const voiceResult = await voiceService.verifyVoiceExists();
      setHasExistingVoice(voiceResult.exists);
      
      // If user already has a voice clone, navigate to synthesis screen
      if (voiceResult.exists) {
        navigation.replace('Synthesis');
      }
    } catch (error) {
      console.error('Error checking for voice ID:', error);
    }
  };
  
  // Show recording modal flow
  const handleShowRecordingModal = async () => {
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    // Check if online
    if (!isOnline) {
      showToast('Klonowanie głosu wymaga połączenia z internetem. Połącz się z internetem i spróbuj ponownie.', 'ERROR');
      return;
    }
    
    // Check if user already has a voice, show confirm dialog if needed
    if (hasExistingVoice) {
      setIsConfirmModalVisible(true);
      return;
    }
    
    // Reset progress data
    setProgressData({ progress: 0, status: '' });
    
    // Show recording modal with instructions first (actual recording starts on button press)
    setIsModalVisible(true);
  };
  
  // Start recording (called after instructions and countdown)
  const handleStartRecording = async () => {
    // Instead of auto-submitting, we now just stop recording automatically
    const success = await startRecording((uri) => {
      // This will be called when recording stops after 60 seconds
      // The UI will transition to review state due to audioUri being set
    });
    
    if (!success) {
      setIsModalVisible(false);
      showToast('Nie udało się rozpocząć nagrywania. Sprawdź uprawnienia mikrofonu.', 'ERROR');
    }
  };
  
  // Stop recording manually (if user presses stop before time limit)
  const handleStopRecording = async () => {
    if (!isRecording) return;
    
    await stopRecording();
    // UI will transition to review state automatically due to audioUri being set
  };

  // Cancel recording modal
  const handleCancelRecording = async () => {
    if (isRecording) {
      await stopRecording();
    }
    
    if (isProcessing) {
      // Cancel any in-progress API calls
      handleCancelCloning();
    }
    
    setIsModalVisible(false);
    setIsProcessing(false);
  };
  
  // Cancel cloning process
  const handleCancelCloning = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setIsProcessing(false);
    setIsModalVisible(false);
    showToast('Klonowanie głosu anulowane', 'INFO');
  };
  
  // Handle re-record from review state
  const handleReRecord = async () => {
    // Clear the audio URI by stopping the recording
    await stopRecording();
  };
  
  // Handle audio file upload
  const handleFileUpload = async () => {
    try {
      // Create new abort controller
      abortControllerRef.current = new AbortController();
      
      // Check if online
      if (!isOnline) {
        showToast('Klonowanie głosu wymaga połączenia z internetem. Połącz się z internetem i spróbuj ponownie.', 'ERROR');
        return;
      }
      
      // Check if user already has a voice, show confirm dialog if needed
      if (hasExistingVoice) {
        setIsConfirmModalVisible(true);
        return;
      }
      
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/m4a'],
        copyToCacheDirectory: true,
      });
      
      if (result.canceled) {
        return;
      }
      
      const fileUri = result.assets[0].uri;
      showToast('Plik audio wybrany pomyślnie', 'SUCCESS');
      
      // Process the file for voice cloning (no review needed for uploaded files)
      processAudioForCloning(fileUri);
    } catch (error) {
      console.error('Error picking document:', error);
      showToast('Wystąpił problem z wybranym plikiem. Spróbuj ponownie.', 'ERROR');
    }
  };
  
  // Process audio (either recorded or uploaded) for voice cloning
  const processAudioForCloning = async (uri) => {
    try {
      // For uploaded files, show the modal with processing state
      if (!isModalVisible) {
        setIsModalVisible(true);
      }
      
      // Switch to processing state
      setIsProcessing(true);
      
      // Set initial progress and status message
      setProgressData({
        progress: 0,
        status: 'Rozpoczynanie klonowania głosu...'
      });
      
      // API call to clone voice with progress callback
      const result = await cloneVoice(
        uri,
        (progress) => {
          // Update progress state
          let statusText = 'Przetwarzanie głosu...';
          
          if (progress < 0.1) {
            statusText = 'Wysyłanie nagrania...';
          } else if (progress < 0.3) {
            statusText = 'Analizowanie próbki głosu...';
          } else if (progress < 0.7) {
            statusText = 'Trenowanie modelu głosu...';
          } else {
            statusText = 'Finalizowanie...';
          }
          
          setProgressData({
            progress: progress * 100,
            status: statusText
          });
        },
        abortControllerRef.current?.signal
      );
      
      // Hide modals at the end
      setIsProcessing(false);
      setIsModalVisible(false);
      
      if (result.success) {
        // Save voice ID to AsyncStorage
        await AsyncStorage.setItem('voice_id', result.voiceId);
        
        showToast('Głos sklonowany pomyślnie!', 'SUCCESS');
        
        // Navigate to synthesis screen
        navigation.replace('Synthesis');
      } else {
        if (result.code === 'OFFLINE') {
          showToast('Klonowanie głosu wymaga połączenia z internetem. Połącz się z internetem i spróbuj ponownie.', 'ERROR');
        } else if (result.code === 'CLONE_TIMEOUT') {
          showToast('Klonowanie głosu trwało zbyt długo. Spróbuj ponownie.', 'ERROR');
        } else {
          showToast(`Błąd klonowania głosu: ${result.error}`, 'ERROR');
        }
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      setIsProcessing(false);
      setIsModalVisible(false);
      showToast('Wystąpił problem podczas przetwarzania audio. Spróbuj ponownie.', 'ERROR');
    }
  };
  
  // Reset voice clone (after confirmation)
  const handleResetVoice = async () => {
    try {
      // Clear voice ID and any generated stories
      await AsyncStorage.removeItem('voice_id');
      await AsyncStorage.removeItem('generated_stories');
      
      setHasExistingVoice(false);
      setIsConfirmModalVisible(false);
      
      showToast('Reset pomyślny. Możesz nagrać nowy głos.', 'INFO');
    } catch (error) {
      console.error('Error resetting voice:', error);
      showToast('Wystąpił problem podczas resetowania. Spróbuj ponownie.', 'ERROR');
    }
  };
  
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../assets/images/logo-stacked.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          
          {!isOnline && (
            <View style={styles.offlineMessage}>
              <Feather name="wifi-off" size={20} color={COLORS.text.secondary} />
              <Text style={styles.offlineText}>
                Klonowanie głosu wymaga połączenia z internetem.
                Połącz się z internetem i spróbuj ponownie.
              </Text>
            </View>
          )}
          
          <View style={styles.optionsContainer}>
            <View style={styles.recordSection}>
              <Text style={styles.sectionTitle}>
                Stwórz próbkę swojego głosu
              </Text>
              <Text style={styles.sectionDescription}>
                Przeczytaj na głos fragment wiersza, który zaraz zobaczysz
              </Text>
              <TouchableOpacity
                style={[
                  styles.recordButton,
                  !isOnline && styles.disabledButton
                ]}
                onPress={handleShowRecordingModal}
                activeOpacity={0.8}
                disabled={!isOnline}
              >
                <Text style={styles.buttonText}>Rozpocznij nagrywanie</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>lub</Text>
              <View style={styles.dividerLine} />
            </View>
            
            <View style={styles.uploadSection}>
              <TouchableOpacity
                style={[
                  styles.uploadButton,
                  !isOnline && styles.disabledButton
                ]}
                onPress={handleFileUpload}
                activeOpacity={0.8}
                disabled={!isOnline}
              >
                <Text style={styles.buttonText}>Prześlij plik audio</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
      
      {/* Recording Modal with enhanced functionality */}
      <RecordingModal
        visible={isModalVisible}
        isRecording={isRecording}
        isProcessing={isProcessing}
        progress={isProcessing ? progressData.progress : progress}
        recordingDuration={recordingDuration}
        statusText={
          isProcessing
            ? progressData.status
            : isRecording
            ? `Pozostało: ${formatDuration(recordingDuration)}`
            : 'Rozpocznij mówić'
        }
        onCancel={handleCancelRecording}
        formatDuration={formatDuration}
        onStartRecording={handleStartRecording}
        audioUri={audioUri}
        onSubmitRecording={processAudioForCloning}
        onReRecord={handleReRecord}
      />
      
      {/* Confirmation Modal */}
      <ConfirmModal
        visible={isConfirmModalVisible}
        title="Na pewno zaczynamy od nowa?"
        message="Usuniemy Twój obecny model głosu i wszystkie dotychczas powstałe bajki. Czy na pewno chcesz kontynuować?"
        confirmText="Usuń i nagraj ponownie"
        cancelText="Anuluj"
        onConfirm={handleResetVoice}
        onCancel={() => setIsConfirmModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    alignItems: 'center', // Centers horizontally
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 128,
    height: 62,
    marginTop: 32,
  },
  title: {
    fontFamily: 'Comfortaa-Regular',
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },
  optionsContainer: {
    marginTop: 32,
  },
  recordSection: {
    backgroundColor: `${COLORS.white}`, // 10% opacity
    padding: 0,
    borderRadius: 12,
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 18,
    color: COLORS.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  sectionDescription: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  recordButton: {
    backgroundColor: COLORS.peach,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  uploadButton: {
    backgroundColor: COLORS.lavender,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: COLORS.text.tertiary,
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.white,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.tertiary,
    paddingHorizontal: 8,
  },
  uploadSection: {
    marginBottom: 8,
  },
  offlineMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 181, 167, 0.2)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  offlineText: {
    flex: 1,
    marginLeft: 8,
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.secondary,
  },
});