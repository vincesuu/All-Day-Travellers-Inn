import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './supabase'

type Room = {
  id: number
  room_number: string
  category: string
  base_rate: number
  status: string
}

type Booking = {
  id: number
  guest_id: number
  room_id: number
  check_in: string
  check_out: string
  nights: number
  total_price: number
  status: 'Reserved' | 'CheckedIn' | 'CheckedOut'
  guests?: {
    full_name: string
    contact: string
  }
  rooms?: {
    room_number: string
    category: string
  }
}

function App() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const [guestName, setGuestName] = useState('')
  const [contact, setContact] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')

  useEffect(() => {
    fetchRooms()
    fetchBookings()
  }, [])

  async function fetchRooms() {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('room_number', { ascending: true })

    if (error) {
      setMessage(`Rooms error: ${error.message}`)
      return
    }

    setRooms(data || [])
  }

  async function fetchBookings() {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        guest_id,
        room_id,
        check_in,
        check_out,
        nights,
        total_price,
        status,
        guests(full_name, contact),
        rooms(room_number, category)
      `)
      .order('id', { ascending: false })

    if (error) {
      setMessage(`Bookings error: ${error.message}`)
      return
    }

    setBookings((data as Booking[]) || [])
  }

  function calculateNights(start: string, end: string) {
    if (!start || !end) return 0

    const checkInDate = new Date(start)
    const checkOutDate = new Date(end)
    const diff = checkOutDate.getTime() - checkInDate.getTime()

    return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0
  }

  function isActiveBooking(status: string) {
    return status === 'Reserved' || status === 'CheckedIn'
  }

  function hasConflict(roomId: number, newCheckIn: string, newCheckOut: string) {
    return bookings.some((booking) => {
      if (booking.room_id !== roomId) return false
      if (!isActiveBooking(booking.status)) return false

      return newCheckIn < booking.check_out && newCheckOut > booking.check_in
    })
  }

  const selectedRoom = useMemo(() => {
    return rooms.find((room) => room.id === Number(selectedRoomId))
  }, [rooms, selectedRoomId])

  const nights = calculateNights(checkIn, checkOut)
  const totalPrice = selectedRoom ? nights * Number(selectedRoom.base_rate) : 0

  const availableRooms = useMemo(() => {
    if (!checkIn || !checkOut) return rooms

    return rooms.filter((room) => !hasConflict(room.id, checkIn, checkOut))
  }, [rooms, bookings, checkIn, checkOut])

  async function findOrCreateGuest() {
    const cleanName = guestName.trim()
    const cleanContact = contact.trim()

    const { data: existingGuest, error: findError } = await supabase
      .from('guests')
      .select('id, full_name, contact')
      .eq('full_name', cleanName)
      .eq('contact', cleanContact)
      .maybeSingle()

    if (findError) throw findError

    if (existingGuest) return existingGuest.id

    const { data: newGuest, error: guestInsertError } = await supabase
      .from('guests')
      .insert([
        {
          full_name: cleanName,
          contact: cleanContact,
        },
      ])
      .select('id')
      .single()

    if (guestInsertError) throw guestInsertError

    return newGuest.id
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')

    const cleanName = guestName.trim()
    const cleanContact = contact.trim()
    const roomId = Number(selectedRoomId)

    if (!cleanName || !cleanContact || !selectedRoomId || !checkIn || !checkOut) {
      setMessage('Please complete all fields.')
      return
    }

    if (cleanName.length < 2) {
      setMessage('Guest name must be at least 2 characters.')
      return
    }

    if (cleanContact.length < 7) {
      setMessage('Please enter a valid contact number.')
      return
    }

    if (nights <= 0) {
      setMessage('Check-out must be later than check-in.')
      return
    }

    if (!selectedRoom) {
      setMessage('Please select a valid room.')
      return
    }

    if (hasConflict(roomId, checkIn, checkOut)) {
      setMessage('Room is already booked for those dates.')
      return
    }

    try {
      setLoading(true)

      const guestId = await findOrCreateGuest()

      const { error: bookingError } = await supabase
        .from('bookings')
        .insert([
          {
            guest_id: guestId,
            room_id: roomId,
            check_in: checkIn,
            check_out: checkOut,
            nights,
            total_price: totalPrice,
            status: 'Reserved',
          },
        ])

      if (bookingError) throw bookingError

      setMessage('Reservation created successfully.')
      setGuestName('')
      setContact('')
      setSelectedRoomId('')
      setCheckIn('')
      setCheckOut('')

      await fetchBookings()
    } catch (error: any) {
      setMessage(error.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>InnSight PMS - Sprint 1</h1>
      <p className="subtitle">
        Manual reservation, room availability, stay logic, and double-booking prevention
      </p>

      {message && <div className="message">{message}</div>}

      <div className="grid">
        <div className="card">
          <h2>Room Inventory</h2>
          <table>
            <thead>
              <tr>
                <th>Room</th>
                <th>Category</th>
                <th>Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => {
                const isAvailable = availableRooms.some((r) => r.id === room.id)

                return (
                  <tr key={room.id}>
                    <td>{room.room_number}</td>
                    <td>{room.category}</td>
                    <td>₱{Number(room.base_rate).toFixed(2)}</td>
                    <td>{isAvailable ? 'Available' : 'Occupied'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Manual Booking Entry</h2>
          <form onSubmit={handleSubmit} className="form">
            <label>Guest Name</label>
            <input
              type="text"
              placeholder="Guest Name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />

            <label>Contact Number</label>
            <input
              type="text"
              placeholder="Contact Number"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />

            <label>Room</label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
            >
              <option value="">Select Room</option>
              {availableRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  Room {room.room_number} - {room.category} - ₱{Number(room.base_rate).toFixed(2)}
                </option>
              ))}
            </select>

            <label>Check-in</label>
            <input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />

            <label>Check-out</label>
            <input
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />

            <div className="summary">
              <p><strong>Nights:</strong> {nights}</p>
              <p><strong>Total Price:</strong> ₱{totalPrice.toFixed(2)}</p>
            </div>

            <button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Create Reservation'}
            </button>
          </form>
        </div>
      </div>

      <div className="card bookings-card">
        <h2>Booking History</h2>
        <table>
          <thead>
            <tr>
              <th>Guest</th>
              <th>Contact</th>
              <th>Room</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Nights</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length > 0 ? (
              bookings.map((booking) => (
                <tr key={booking.id}>
                  <td>{booking.guests?.full_name || '-'}</td>
                  <td>{booking.guests?.contact || '-'}</td>
                  <td>
                    {booking.rooms?.room_number
                      ? `Room ${booking.rooms.room_number}`
                      : '-'}
                  </td>
                  <td>{booking.check_in}</td>
                  <td>{booking.check_out}</td>
                  <td>{booking.nights}</td>
                  <td>₱{Number(booking.total_price).toFixed(2)}</td>
                  <td>{booking.status}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center' }}>
                  No bookings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default App