import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../styles/colors';

const STATUS_TITLES = {
  queued_for_slot: 'Gwiezdna Kolejka',
  allocating_voice: 'Budzenie Głosu',
  processing: 'Tkamy Baśń',
  downloading: 'Zsyłanie Opowieści',
  ready: 'Opowieść Już Czeka',
  error: 'Zakłócenie Magii'
};

const STATUS_DESCRIPTIONS = {
  queued_for_slot:
    'Twoja baśń stoi na puszystej chmurce i cierpliwie czeka, aż gwiezdny przewoźnik zaprosi ją dalej.',
  allocating_voice:
    'Leśne wróżki rozplątują wstążki głosu, by brzmiał dokładnie tak, jak Wasza rodzina lubi.',
  processing:
    'Magiczne pióra zapisują każdy akapit, aby historia mogła rozbłysnąć w wyobraźni.',
  downloading:
    'Kryształowy strumień niesie dźwięki prosto do Twojego urządzenia – wystarczy jeszcze chwila.',
  ready:
    'Baśń właśnie rozłożyła skrzydła i jest gotowa, by zabrzmieć w Waszym pokoju.',
  error:
    'Mgła przysłoniła drogę opowieści. Daj nam moment, a zaczarujemy ścieżkę na nowo.'
};

const STATUS_ICONS = {
  queued_for_slot: 'moon',
  allocating_voice: 'wind',
  processing: 'feather',
  downloading: 'cloud-lightning',
  ready: 'star',
  error: 'alert-circle'
};

const TIP_LIBRARY = {
  queued_for_slot: [
    'TIP: Szepnij dziecku, że nawet bohaterowie muszą chwilę poczekać, nim zacznie się przygoda.',
    'TIP: Zapal drobną lampkę – to znak dla historii, że zna drogę do Waszej kanapy.'
  ],
  allocating_voice: [
    'TIP: Zachęć malucha, by wyszeptał życzenie – głos baśni usłyszy każdy szept.',
    'TIP: Przygotuj miękki kocyk, by opowieść miała miękkie lądowanie.'
  ],
  processing: [
    'TIP: Poproś dziecko, by narysowało bohatera – ilustracja dodaje opowieści skrzydeł.',
    'TIP: Powiedz, że mali narratorzy dopisują właśnie najciekawszy zwrot akcji.'
  ],
  downloading: [
    'TIP: W ciszy lepiej słychać, jak magia kapie prosto do głośnika.',
    'TIP: Zaproście pluszowego słuchacza – będzie pierwszym recenzentem baśni.'
  ],
  ready: [
    'TIP: Przytulcie się i wybierzcie słowo, które pojawi się w przygodzie.',
    'TIP: Zgaście światło i zostawcie jedną świeczkę – opowieści lubią taki blask.'
  ],
  error: [
    'TIP: Uspokój dziecko, mówiąc, że skrzaty porządkują jeszcze półki z bajkami.',
    'TIP: Zaproponuj mini-zabawę w zgadywanie zakończenia – magia zaraz wróci.'
  ]
};

const ProgressModal = ({
  visible,
  progress,
  status,
  statusKey,
  onCancel
}) => {
  const normalizedStatusKey =
    typeof statusKey === 'string' ? statusKey.trim().toLowerCase() : null;
  const title = STATUS_TITLES[normalizedStatusKey] || STATUS_TITLES.processing;
  const description =
    STATUS_DESCRIPTIONS[normalizedStatusKey] || STATUS_DESCRIPTIONS.processing;
  const iconName = STATUS_ICONS[normalizedStatusKey] || STATUS_ICONS.processing;
  const statusText = typeof status === 'string' ? status : '';
  const isComplete = normalizedStatusKey === 'ready';
  const isError = normalizedStatusKey === 'error';
  const canCancel = typeof onCancel === 'function' && !isComplete;

  const normalisedProgress =
    typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : 0;
  const tipPool = TIP_LIBRARY[normalizedStatusKey] || TIP_LIBRARY.processing;
  const tipIndex = Math.min(
    tipPool.length - 1,
    Math.floor(normalisedProgress / 100 * tipPool.length)
  );
  const tip = tipPool[Math.max(0, tipIndex)];

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalContent}>
          <View style={styles.headerRow}>
            <Feather
              name={iconName}
              size={40}
              color={isError ? COLORS.error : COLORS.peach}
              style={[
                styles.statusIcon,
                normalizedStatusKey === 'processing' && styles.iconSpinning
              ]}
            />
            <Text style={styles.title}>{title}</Text>
          </View>

          <Text style={styles.description}>{description}</Text>

          {statusText ? <Text style={styles.status}>{statusText}</Text> : null}

          <View style={styles.loadingIndicator}>
            {isComplete ? (
              <Feather
                name="check-circle"
                size={48}
                color={COLORS.mint}
                accessibilityRole="image"
                accessibilityLabel="Generowanie zakończone"
              />
            ) : isError ? (
              <Feather
                name="alert-circle"
                size={48}
                color={COLORS.error}
                accessibilityRole="image"
                accessibilityLabel="Wystąpił błąd"
              />
            ) : (
              <ActivityIndicator size="large" color={COLORS.peach} />
            )}
          </View>

          <View style={styles.tipContainer}>
            <Text style={styles.tipLabel}>TIP</Text>
            <Text style={styles.tipText}>{tip}</Text>
          </View>

          {canCancel ? (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Anuluj generowanie"
            >
              <Feather name="x" size={20} color={COLORS.text.secondary} />
              <Text style={styles.cancelText}>Anuluj</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerRow: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 16
  },
  statusIcon: {
    marginBottom: 12
  },
  title: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 20,
    color: COLORS.text.primary,
    textAlign: 'center'
  },
  description: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 16,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22
  },
  status: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.secondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  loadingIndicator: {
    marginBottom: 24,
    alignItems: 'center'
  },
  tipContainer: {
    width: '100%',
    backgroundColor: `${COLORS.lavender}20`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  tipLabel: {
    fontFamily: 'Quicksand-SemiBold',
    fontSize: 12,
    color: COLORS.peach,
    marginBottom: 6,
    letterSpacing: 1,
  },
  tipText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
    lineHeight: 20,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  cancelText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.secondary,
    marginLeft: 8,
  },
  iconSpinning: {
    // Placeholder class if we later wire animated rotation
  },
});

export default ProgressModal;
