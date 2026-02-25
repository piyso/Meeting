# How to Enable Stereo Mix on Windows

## Overview

Stereo Mix is a Windows audio feature that allows applications to capture system audio (the sounds playing through your speakers or headphones). PiyAPI Notes uses Stereo Mix to record audio from online meetings, videos, and other applications.

**Why do I need this?** Without Stereo Mix enabled, PiyAPI Notes can only capture your microphone audio, not the audio from other participants in your meetings.

---

## Quick Start

### Windows 11

1. **Open Sound Settings**
   - Right-click the speaker icon in the system tray (bottom-right corner)
   - Click "Sound settings"
   - Or press `Windows + I` → System → Sound

2. **Access Advanced Sound Settings**
   - Scroll down and click "More sound settings" under Advanced
   - This opens the classic Sound control panel

3. **Show Disabled Devices**
   - In the Sound window, click the "Recording" tab
   - Right-click anywhere in the empty space
   - Check "Show Disabled Devices"
   - Check "Show Disconnected Devices"

4. **Enable Stereo Mix**
   - You should now see "Stereo Mix" in the list
   - Right-click "Stereo Mix"
   - Click "Enable"

5. **Set as Default (Optional)**
   - Right-click "Stereo Mix" again
   - Click "Set as Default Device" (if you want it as primary)
   - Or "Set as Default Communication Device" (for meeting apps)

6. **Verify It's Working**
   - Play a YouTube video or music
   - Watch the green level meter next to Stereo Mix
   - If it moves, Stereo Mix is capturing audio correctly

### Windows 10

1. **Open Sound Settings**
   - Right-click the speaker icon in the system tray
   - Click "Sounds"
   - Or press `Windows + R`, type `mmsys.cpl`, press Enter

2. **Show Disabled Devices**
   - Click the "Recording" tab
   - Right-click anywhere in the empty space
   - Check "Show Disabled Devices"
   - Check "Show Disconnected Devices"

3. **Enable Stereo Mix**
   - You should now see "Stereo Mix" in the list
   - Right-click "Stereo Mix"
   - Click "Enable"

4. **Set as Default (Optional)**
   - Right-click "Stereo Mix" again
   - Click "Set as Default Device"

5. **Verify It's Working**
   - Play a YouTube video or music
   - Watch the green level meter next to Stereo Mix
   - If it moves, Stereo Mix is capturing audio correctly

---

## Detailed Step-by-Step Guide with Screenshots

### Step 1: Open Windows Sound Settings

**Windows 11:**

- Right-click the speaker icon (🔊) in the system tray (bottom-right corner of your screen)
- Click "Sound settings" from the menu
- Alternative: Press `Windows + I` to open Settings, then navigate to System → Sound

**Windows 10:**

- Right-click the speaker icon (🔊) in the system tray
- Click "Sounds" from the menu
- Alternative: Press `Windows + R`, type `mmsys.cpl`, and press Enter

**What you'll see:** A window with tabs for Playback, Recording, Sounds, and Communications.

---

### Step 2: Navigate to Recording Devices

**Windows 11:**

- In the Sound settings page, scroll down to the "Advanced" section
- Click "More sound settings" (this opens the classic Sound control panel)
- Click the "Recording" tab

**Windows 10:**

- The Sound control panel should open directly
- Click the "Recording" tab at the top

**What you'll see:** A list of recording devices (microphones, line-in, etc.). Stereo Mix may not be visible yet.

---

### Step 3: Show Disabled and Disconnected Devices

**Both Windows 10 and 11:**

- Right-click anywhere in the empty space within the Recording tab (not on a device)
- You'll see a context menu with two options:
  - ☐ Show Disabled Devices
  - ☐ Show Disconnected Devices
- Click both options to check them

**What you'll see:** Additional devices will appear in the list, including "Stereo Mix" (if your audio driver supports it).

**Visual cue:** Disabled devices appear grayed out with a down arrow icon (↓).

---

### Step 4: Enable Stereo Mix

**Both Windows 10 and 11:**

- Locate "Stereo Mix" in the list of recording devices
- Right-click on "Stereo Mix"
- Click "Enable" from the context menu

**What you'll see:** The Stereo Mix icon will change from grayed out to colored, and the down arrow will disappear.

**If Stereo Mix is not in the list:** See the "Troubleshooting" section below.

---

### Step 5: Set Stereo Mix as Default (Optional)

**Both Windows 10 and 11:**

- Right-click on "Stereo Mix" again
- Choose one of the following:
  - **"Set as Default Device"** - Makes Stereo Mix the primary recording device for all applications
  - **"Set as Default Communication Device"** - Makes Stereo Mix the default for communication apps (Zoom, Teams, Discord)

**Recommendation:** Set as "Default Communication Device" if you want to keep your microphone as the default for other apps.

**What you'll see:** A green checkmark icon will appear next to Stereo Mix.

---

### Step 6: Verify Stereo Mix is Working

**Both Windows 10 and 11:**

1. Keep the Sound control panel open with the Recording tab visible
2. Open a web browser and play a YouTube video or music
3. Watch the green level meter (vertical bars) next to "Stereo Mix"
4. If the meter moves up and down with the audio, Stereo Mix is working correctly

**What you'll see:** Green bars that bounce in sync with the audio playing on your computer.

**If the meter doesn't move:** See the "Troubleshooting" section below.

---

### Step 7: Test in PiyAPI Notes

1. Return to PiyAPI Notes
2. Click "Start Meeting" or "Test Audio Capture"
3. Play audio from another application (YouTube, Spotify, etc.)
4. PiyAPI Notes should now capture and transcribe the system audio

**What you'll see:** Real-time transcription of the audio playing on your computer.

---

## Troubleshooting

### Problem: Stereo Mix is not in the list

**Possible causes:**

1. Your audio driver doesn't support Stereo Mix
2. Your audio driver is outdated
3. You're using a USB audio device or external sound card

**Solutions:**

#### Solution 1: Update Your Audio Driver

1. Press `Windows + X` and select "Device Manager"
2. Expand "Sound, video and game controllers"
3. Right-click your audio device (usually "Realtek High Definition Audio" or similar)
4. Click "Update driver"
5. Choose "Search automatically for drivers"
6. Restart your computer after the update
7. Repeat the steps above to enable Stereo Mix

#### Solution 2: Install Realtek Audio Driver

- Many motherboards use Realtek audio chips
- Download the latest Realtek HD Audio Driver from your motherboard manufacturer's website
- Install the driver and restart your computer
- Stereo Mix should now appear in the Recording devices list

#### Solution 3: Use VB-Audio Virtual Cable (Free Alternative)

If your audio driver doesn't support Stereo Mix, you can use a virtual audio cable:

1. Download VB-Audio Virtual Cable from: https://vb-audio.com/Cable/
2. Install the software (it's free)
3. This creates a virtual audio device that can capture system audio
4. In PiyAPI Notes, select "CABLE Output" as your audio source

#### Solution 4: Use Microphone Fallback

- PiyAPI Notes can use your microphone to capture audio
- Click "Use Microphone" in the error dialog
- This captures your voice and audio from your speakers (if they're loud enough)
- **Note:** Audio quality may be lower than Stereo Mix

#### Solution 5: Use Cloud Transcription

- PiyAPI Notes offers cloud-based transcription as a fallback
- Click "Use Cloud Transcription" in the error dialog
- Your audio is sent to Deepgram API for transcription
- **Note:** Requires internet connection and uses cloud transcription quota

---

### Problem: Stereo Mix is enabled but not capturing audio

**Possible causes:**

1. Stereo Mix is not set as the default device
2. Volume level is too low
3. Another application is using Stereo Mix exclusively

**Solutions:**

#### Solution 1: Set as Default Device

1. Open Sound control panel → Recording tab
2. Right-click "Stereo Mix"
3. Click "Set as Default Device"
4. Test again in PiyAPI Notes

#### Solution 2: Increase Stereo Mix Volume

1. Open Sound control panel → Recording tab
2. Right-click "Stereo Mix" → Properties
3. Click the "Levels" tab
4. Set the volume slider to 100%
5. Click "OK"
6. Test again

#### Solution 3: Check Exclusive Mode

1. Open Sound control panel → Recording tab
2. Right-click "Stereo Mix" → Properties
3. Click the "Advanced" tab
4. Uncheck "Allow applications to take exclusive control of this device"
5. Click "OK"
6. Test again

---

### Problem: Stereo Mix captures audio but it's very quiet

**Solution: Boost Stereo Mix Volume**

1. Open Sound control panel → Recording tab
2. Right-click "Stereo Mix" → Properties
3. Click the "Levels" tab
4. Set the volume slider to 100%
5. If there's a "Microphone Boost" option, set it to +10dB or +20dB
6. Click "OK"
7. Test again

---

### Problem: Stereo Mix captures audio but also captures microphone

**Solution: Disable Microphone Monitoring**

1. Open Sound control panel → Recording tab
2. Right-click your microphone → Properties
3. Click the "Listen" tab
4. Uncheck "Listen to this device"
5. Click "OK"

---

### Problem: I have multiple audio devices (USB headset, speakers, etc.)

**Solution: Select the Correct Playback Device**

Stereo Mix captures audio from your **default playback device**. If you're using a USB headset or external speakers, make sure they're set as the default:

1. Open Sound control panel → Playback tab
2. Right-click your desired audio device (USB headset, speakers, etc.)
3. Click "Set as Default Device"
4. Now Stereo Mix will capture audio from that device

**Example:** If you're in a Zoom meeting using a USB headset, set the USB headset as the default playback device so Stereo Mix can capture the meeting audio.

---

## Alternative Solutions

If you cannot enable Stereo Mix or prefer not to use it, PiyAPI Notes offers two alternatives:

### 1. Microphone Capture

- **How it works:** Captures audio through your microphone
- **Pros:** Works on all systems, no setup required
- **Cons:** Only captures your voice, not other participants (unless they're loud enough to be picked up by your mic)
- **Best for:** Solo recordings, voice notes, dictation

### 2. Cloud Transcription

- **How it works:** Sends audio to Deepgram API for transcription
- **Pros:** High accuracy, works without local audio capture
- **Cons:** Requires internet connection, uses cloud transcription quota
- **Quota:** Free tier: 10 hours/month, Pro tier: Unlimited
- **Best for:** When local audio capture fails or for higher accuracy

---

## Frequently Asked Questions

### Q: Is Stereo Mix safe to enable?

**A:** Yes, Stereo Mix is a built-in Windows feature and is completely safe to enable. It only allows applications to capture audio that's already playing on your computer.

### Q: Will enabling Stereo Mix affect my audio quality?

**A:** No, enabling Stereo Mix does not affect your audio playback quality. It only creates a recording source for applications to use.

### Q: Can I use Stereo Mix and my microphone at the same time?

**A:** Yes, but you'll need to configure PiyAPI Notes to use both sources. By default, PiyAPI Notes uses either Stereo Mix (for system audio) or microphone (as a fallback).

### Q: Does Stereo Mix work with Bluetooth headphones?

**A:** Yes, Stereo Mix captures audio from your default playback device, including Bluetooth headphones. Make sure your Bluetooth headphones are set as the default playback device.

### Q: Why doesn't macOS have Stereo Mix?

**A:** macOS uses a different audio system. On macOS, PiyAPI Notes uses ScreenCaptureKit to capture system audio, which requires Screen Recording permission instead of Stereo Mix.

### Q: Will Stereo Mix capture audio from all applications?

**A:** Yes, Stereo Mix captures all audio playing through your default playback device, including web browsers, media players, and meeting applications.

### Q: Can I disable Stereo Mix after I'm done recording?

**A:** Yes, you can disable Stereo Mix at any time by right-clicking it in the Recording tab and selecting "Disable". This won't affect your recordings.

### Q: Does Stereo Mix work with external audio interfaces?

**A:** It depends on the audio interface. Some external audio interfaces (like Focusrite, PreSonus) have their own "loopback" or "stereo mix" features. Check your audio interface's documentation.

---

## Video Tutorial

**Coming Soon:** We're working on a video tutorial that will walk you through the entire process of enabling Stereo Mix on Windows 10 and Windows 11.

In the meantime, you can find community-created tutorials on YouTube by searching for "enable Stereo Mix Windows 11" or "enable Stereo Mix Windows 10".

---

## Additional Resources

- **Microsoft Support:** [How to manage sound settings in Windows](https://support.microsoft.com/en-us/windows/how-to-manage-sound-settings-in-windows-e5d3f6a0-8b3e-4b3f-b3f3-3b3f3b3f3b3f)
- **Realtek Audio Driver:** [Download from your motherboard manufacturer's website]
- **VB-Audio Virtual Cable:** [https://vb-audio.com/Cable/](https://vb-audio.com/Cable/)
- **PiyAPI Notes Support:** [Contact us if you need help]

---

## Still Having Issues?

If you've followed all the steps above and still can't enable Stereo Mix:

1. **Use Microphone Fallback:** Click "Use Microphone" in the error dialog
2. **Use Cloud Transcription:** Click "Use Cloud Transcription" for reliable transcription
3. **Contact Support:** Reach out to PiyAPI Notes support with your system details:
   - Windows version (Windows 10 or 11)
   - Audio driver name and version (from Device Manager)
   - Screenshot of the Recording devices list
   - Error messages from PiyAPI Notes

We're here to help you get the best transcription experience!

---

## Technical Details (For Advanced Users)

### What is Stereo Mix?

Stereo Mix is a Windows audio feature that creates a virtual recording device. It captures the audio stream that's being sent to your speakers or headphones, allowing applications to record "what you hear" instead of just microphone input.

### How PiyAPI Notes Uses Stereo Mix

1. **Audio Capture:** PiyAPI Notes uses Electron's `desktopCapturer` API to enumerate audio sources
2. **Detection:** The app searches for sources containing "Stereo Mix" or "System Audio"
3. **Capture:** Audio is captured using the Web Audio API (AudioWorkletNode)
4. **Processing:** Audio is processed through a Voice Activity Detection (VAD) system
5. **Transcription:** Voice segments are sent to the local Whisper model for transcription

### Fallback Chain

PiyAPI Notes implements a three-tier fallback chain:

1. **Primary:** System Audio (Stereo Mix on Windows, ScreenCaptureKit on macOS)
2. **Secondary:** Microphone (via getUserMedia API)
3. **Tertiary:** Cloud Transcription (Deepgram API)

This ensures you can always transcribe your meetings, even if system audio capture fails.

### Privacy Note

When using Stereo Mix, all audio processing happens locally on your computer. Audio is never sent to the cloud unless you explicitly enable "Cloud Transcription" in the settings.

---

**Last Updated:** February 2026  
**Version:** 1.0  
**Applies to:** PiyAPI Notes v1.0+, Windows 10 and Windows 11
