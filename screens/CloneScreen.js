import React, { useState, useEffect } from 'react';
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
import RecordingModal from '../components/Modals/RecordingModal';
import ConfirmModal from '../components/Modals/ConfirmModal';
import { useToast } from '../components/StatusToast';
import useAudioRecorder from '../hooks/useAudioRecorder';
import { cloneVoice } from '../services/voiceService';
import { COLORS } from '../styles/colors';

export default function CloneScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  
  // State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasExistingVoice, setHasExistingVoice] = useState(false);
  const [pwaInstallable, setPwaInstallable] = useState(false);
  
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
  
  // Check for existing voice clone on mount
  useEffect(() => {
    checkExistingVoice();
  }, []);
  
  // Check if user has an existing voice clone
  const checkExistingVoice = async () => {
    try {
      const voiceId = await AsyncStorage.getItem('voice_id');
      setHasExistingVoice(!!voiceId);
      
      // If user already has a voice clone, navigate to synthesis screen
      if (voiceId) {
        navigation.replace('Synthesis');
      }
    } catch (error) {
      console.error('Error checking for voice ID:', error);
    }
  };
  
  // Start recording flow
  const handleStartRecording = async () => {
    // Check if user already has a voice, show confirm dialog if needed
    if (hasExistingVoice) {
      setIsConfirmModalVisible(true);
      return;
    }
    
    // Show recording modal and start recording
    setIsModalVisible(true);
    const success = await startRecording();
    
    if (!success) {
      setIsModalVisible(false);
      showToast('Nie udało się rozpocząć nagrywania. Sprawdź uprawnienia mikrofonu.', 'ERROR');
    }
  };
  
  // Stop recording and process audio
  const handleStopRecording = async () => {
    if (!isRecording) return;
    
    const uri = await stopRecording();
    if (uri) {
      processAudioForCloning(uri);
    } else {
      setIsModalVisible(false);
      showToast('Wystąpił problem z nagraniem. Spróbuj ponownie.', 'ERROR');
    }
  };
  
  // Cancel recording modal
  const handleCancelRecording = async () => {
    if (isRecording) {
      await stopRecording();
    }
    
    if (isProcessing) {
      // Consider adding logic to cancel in-progress API calls
    }
    
    setIsModalVisible(false);
    setIsProcessing(false);
  };
  
  // Handle audio file upload
  const handleFileUpload = async () => {
    try {
      // Check if user already has a voice, show confirm dialog if needed
      if (hasExistingVoice) {
        setIsConfirmModalVisible(true);
        return;
      }
      
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/wav'],
        copyToCacheDirectory: true,
      });
      
      if (result.canceled) {
        return;
      }
      
      const fileUri = result.assets[0].uri;
      showToast('Plik audio wybrany pomyślnie', 'SUCCESS');
      
      // Process the file for voice cloning
      processAudioForCloning(fileUri);
    } catch (error) {
      console.error('Error picking document:', error);
      showToast('Wystąpił problem z wybranym plikiem. Spróbuj ponownie.', 'ERROR');
    }
  };
  
  // Process audio (either recorded or uploaded) for voice cloning
  const processAudioForCloning = async (uri) => {
    try {
      setIsProcessing(true);
      
      // API call to clone voice
      const result = await cloneVoice(uri);
      
      setIsProcessing(false);
      setIsModalVisible(false);
      
      if (result.success) {
        // Save voice ID to AsyncStorage
        await AsyncStorage.setItem('voice_id', result.voiceId);
        
        showToast('Głos sklonowany pomyślnie!', 'SUCCESS');
        
        // Navigate to synthesis screen
        navigation.replace('Synthesis');
      } else {
        showToast(`Błąd klonowania głosu: ${result.error}`, 'ERROR');
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
              source={require('../assets/images/logo.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>DawnoTemu</Text>
          </View>
          
          <View style={styles.optionsContainer}>
            <View style={styles.recordSection}>
              <View style={styles.emojiContainer}>
                <Text style={styles.emoji}>👦👧</Text>
              </View>
              <Text style={styles.sectionTitle}>
                Stwórz próbkę swojego głosu
              </Text>
              <Text style={styles.sectionDescription}>
                Przeczytaj na głos fragment wiersza, który zaraz zobaczysz
              </Text>
              <TouchableOpacity
                style={styles.recordButton}
                onPress={handleStartRecording}
                activeOpacity={0.8}
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
                style={styles.uploadButton}
                onPress={handleFileUpload}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>Prześlij plik audio</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
      
      {/* Recording Modal */}
      <RecordingModal
        visible={isModalVisible}
        isRecording={isRecording}
        isProcessing={isProcessing}
        progress={progress}
        recordingDuration={recordingDuration}
        statusText={
          isProcessing
            ? 'Przetwarzanie głosu...'
            : isRecording
            ? `Nagrywanie: ${formatDuration(recordingDuration)}`
            : 'Rozpocznij mówić'
        }
        onCancel={handleCancelRecording}
        formatDuration={formatDuration}
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
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Comfortaa-Regular',
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },
  optionsContainer: {
    marginTop: 8,
  },
  recordSection: {
    backgroundColor: `${COLORS.peach}10`, // 10% opacity
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  emojiContainer: {
    marginBottom: 16,
  },
  emoji: {
    fontSize: 36,
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
  installButton: {
    position: 'absolute',
    right: 16,
    backgroundColor: COLORS.peach,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
});