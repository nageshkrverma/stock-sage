import React from 'react'
import { View, Text, Modal, TouchableOpacity, FlatList, StyleSheet } from 'react-native'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1939 }, (_, i) => CURRENT_YEAR - i)

function daysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate()
}

interface Props {
  visible: boolean
  day: number; month: number; year: number
  onDayChange: (d: number) => void
  onMonthChange: (m: number) => void
  onYearChange: (y: number) => void
  onConfirm: () => void
  onClose: () => void
}

export default function DOBPickerModal({ visible, day, month, year, onDayChange, onMonthChange, onYearChange, onConfirm, onClose }: Props) {
  const totalDays = daysInMonth(month, year)
  const days = Array.from({ length: totalDays }, (_, i) => i + 1)

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={s.title}>Select Date of Birth</Text>

          <View style={s.row}>
            {/* Day */}
            <View style={s.col}>
              <Text style={s.colLabel}>Day</Text>
              <FlatList
                data={days}
                keyExtractor={(d) => String(d)}
                style={s.list}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity style={[s.item, item === day && s.itemActive]} onPress={() => onDayChange(item)}>
                    <Text style={[s.itemText, item === day && s.itemTextActive]}>{String(item).padStart(2, '0')}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>

            {/* Month */}
            <View style={s.col}>
              <Text style={s.colLabel}>Month</Text>
              <FlatList
                data={MONTHS}
                keyExtractor={(_, i) => String(i)}
                style={s.list}
                showsVerticalScrollIndicator={false}
                renderItem={({ item, index }) => (
                  <TouchableOpacity style={[s.item, (index + 1) === month && s.itemActive]} onPress={() => onMonthChange(index + 1)}>
                    <Text style={[s.itemText, (index + 1) === month && s.itemTextActive]}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>

            {/* Year */}
            <View style={s.col}>
              <Text style={s.colLabel}>Year</Text>
              <FlatList
                data={YEARS}
                keyExtractor={(y) => String(y)}
                style={s.list}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity style={[s.item, item === year && s.itemActive]} onPress={() => onYearChange(item)}>
                    <Text style={[s.itemText, item === year && s.itemTextActive]}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>

          <View style={s.btnRow}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={onConfirm}>
              <Text style={s.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#13131A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  handle: { width: 40, height: 4, backgroundColor: '#2A2A3A', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 20 },
  row: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  colLabel: { color: '#8B8FA8', fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  list: { height: 200, backgroundColor: '#0D0D14', borderRadius: 12, borderWidth: 1, borderColor: '#1E1E2E' },
  item: { paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1A1A28' },
  itemActive: { backgroundColor: '#6C63FF20' },
  itemText: { color: '#8B8FA8', fontSize: 14 },
  itemTextActive: { color: '#6C63FF', fontWeight: '800', fontSize: 15 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, backgroundColor: '#1E1E2E', borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#8B8FA8', fontSize: 15, fontWeight: '600' },
  confirmBtn: { flex: 1, backgroundColor: '#6C63FF', borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
})
