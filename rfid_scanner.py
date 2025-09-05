#!/usr/bin/env python3
import serial
import time
import sys

SERIAL_PORT = '/dev/ttyUSB0'
BAUD_RATE = 115200

def calculate_checksum(data):
    """Calculate checksum from Type to last Parameter"""
    if len(data) < 5:  # Header + Type + Command + PL(MSB) + PL(LSB)
        return 0
    # Sum from Type (index 1) to end of parameters
    return sum(data[1:]) & 0xFF

def send_inventory_command(ser):
    """Send single inventory command with proper checksum"""
    # Frame: Header, Type, Command, PL(MSB), PL(LSB), Checksum, End
    # For inventory: BB 00 22 00 00 [checksum] 7E
    frame_data = bytes([0x00, 0x22, 0x00, 0x00])  # Type to PL(LSB)
    checksum = calculate_checksum(bytes([0xBB]) + frame_data)
    
    cmd = bytes([0xBB]) + frame_data + bytes([checksum, 0x7E])
    ser.write(cmd)
    return cmd

def parse_response(data):
    """Parse any response from the module"""
    if len(data) < 7:  # Minimum frame length
        return None, "Too short"
    
    if data[0] != 0xBB:
        return None, "Invalid header"
    
    # Response frame (Type = 0x01)
    if data[1] == 0x01:
        if data[2] == 0xFF:  # Error response
            error_code = data[5] if len(data) > 5 else 0
            return {"type": "error", "code": error_code}, None
        # Other responses...
    
    # Notification frame (Type = 0x02) - tag detection
    elif data[1] == 0x02 and data[2] == 0x22:
        if len(data) < 11:
            return None, "Short tag response"
        
        # Parse tag data
        data_len = (data[3] << 8) + data[4]  # PL field
        if len(data) < 5 + data_len + 2:  # +2 for checksum and end
            return None, "Incomplete tag data"
        
        rssi = data[5]
        pc = (data[6] << 8) + data[7]
        epc_length = data_len - 3  # Subtract RSSI(1) + PC(2)
        
        epc_start = 8
        epc_end = epc_start + epc_length
        epc_data = data[epc_start:epc_end]
        
        epc_hex = ''.join(f'{byte:02X}' for byte in epc_data)
        
        return {
            "type": "tag",
            "rssi": rssi,
            "pc": pc,
            "epc": epc_hex,
            "raw": data.hex().upper()
        }, None
    
    return None, "Unknown response"

def main():
    try:
        with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1) as ser:
            print(f"Connected to {SERIAL_PORT}")
            print("Scanning for RFID tags. Make sure tag is close to antenna.")
            print("Press Ctrl+C to exit\n")
            
            # Flush any existing data
            ser.reset_input_buffer()
            
            while True:
                # Send inventory command
                cmd = send_inventory_command(ser)
                
                # Read response with longer timeout
                response = ser.read(128)
                
                if response:
                    result, error = parse_response(response)
                    if result:
                        if result["type"] == "tag":
                            print(f"Tag detected! EPC: {result['epc']}")
                            print(f"RSSI: {result['rssi']}, PC: 0x{result['pc']:04X}")
                        elif result["type"] == "error":
                            if result["code"] == 0x15:
                                print("No tag detected (inventory fail)")
                            else:
                                print(f"Error: 0x{result['code']:02X}")
                    else:
                        print(f"Parse error: {error}")
                        print(f"Raw response: {response.hex().upper()}")
                else:
                    print("No response from reader")
                
                # Short delay
                time.sleep(0.5)
                
    except KeyboardInterrupt:
        print("\nExiting...")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()