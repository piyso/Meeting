/**
 * Windows Audio Capture Test Script
 * 
 * Purpose: Validate audio capture functionality on Windows machines with different audio drivers
 * 
 * Test Criteria:
 * - PASS: Console shows changing byte stream when YouTube plays audio
 * - FAIL: Document failure mode, test microphone fallback
 * 
 * Target: >80% success rate across all test machines
 */

const { desktopCapturer } = require('electron');

class AudioCaptureTest {
  constructor() {
    this.testResults = [];
    this.audioContext = null;
    this.mediaStream = null;
    this.analyser = null;
    this.dataArray = null;
  }

  /**
   * Test 1: Enumerate available audio sources
   */
  async enumerateAudioSources() {
    console.log('\n=== Test 1: Enumerating Audio Sources ===');
    
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        fetchWindowIcons: false
      });

      console.log(`Found ${sources.length} sources`);
      
      const audioSources = sources.filter(source => 
        source.name.toLowerCase().includes('stereo mix') ||
        source.name.toLowerCase().includes('system audio') ||
        source.name.toLowerCase().includes('loopback')
      );

      if (audioSources.length > 0) {
        console.log('✅ System audio sources detected:');
        audioSources.forEach(source => {
          console.log(`   - ${source.name} (ID: ${source.id})`);
        });
        return { success: true, sources: audioSources };
      } else {
        console.log('❌ No system audio sources found');
        console.log('   Available sources:');
        sources.slice(0, 5).forEach(source => {
          console.log(`   - ${source.name}`);
        });
        return { success: false, sources: [], reason: 'No system audio sources detected' };
      }
    } catch (error) {
      console.error('❌ Error enumerating sources:', error.message);
      return { success: false, sources: [], reason: error.message };
    }
  }

  /**
   * Test 2: Capture system audio and verify byte stream changes
   */
  async captureSystemAudio(sourceId) {
    console.log('\n=== Test 2: Capturing System Audio ===');
    console.log('Instructions: Play audio from YouTube or any media player');
    
    try {
      // Request audio stream using desktopCapturer
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        },
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: 1,
            maxHeight: 1
          }
        }
      });

      // Remove video track (we only need audio)
      stream.getVideoTracks().forEach(track => track.stop());

      this.mediaStream = stream;
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      
      source.connect(this.analyser);
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      console.log('✅ Audio capture initialized');
      console.log(`   Sample rate: ${this.audioContext.sampleRate}Hz`);
      console.log(`   Buffer length: ${bufferLength}`);
      
      return { success: true };
    } catch (error) {
      console.error('❌ Error capturing audio:', error.message);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Test 3: Monitor audio byte stream for changes
   */
  async monitorByteStream(durationSeconds = 10) {
    console.log(`\n=== Test 3: Monitoring Byte Stream (${durationSeconds}s) ===`);
    console.log('Ensure audio is playing...\n');

    return new Promise((resolve) => {
      const samples = [];
      const interval = 500; // Sample every 500ms
      const totalSamples = (durationSeconds * 1000) / interval;
      let sampleCount = 0;

      const sampleInterval = setInterval(() => {
        if (!this.analyser || !this.dataArray) {
          clearInterval(sampleInterval);
          resolve({ success: false, reason: 'Analyser not initialized' });
          return;
        }

        this.analyser.getByteTimeDomainData(this.dataArray);
        
        // Calculate RMS (Root Mean Square) to detect audio level
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
          const normalized = (this.dataArray[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / this.dataArray.length);
        const db = 20 * Math.log10(rms);
        
        samples.push({ rms, db, timestamp: Date.now() });
        
        // Display progress
        const bar = '█'.repeat(Math.floor(rms * 50));
        console.log(`Sample ${sampleCount + 1}/${totalSamples}: RMS=${rms.toFixed(4)} | dB=${db.toFixed(2)} | ${bar}`);
        
        sampleCount++;
        
        if (sampleCount >= totalSamples) {
          clearInterval(sampleInterval);
          
          // Analyze results
          const avgRms = samples.reduce((sum, s) => sum + s.rms, 0) / samples.length;
          const maxRms = Math.max(...samples.map(s => s.rms));
          const minRms = Math.min(...samples.map(s => s.rms));
          const variance = samples.reduce((sum, s) => sum + Math.pow(s.rms - avgRms, 2), 0) / samples.length;
          
          console.log('\n--- Analysis ---');
          console.log(`Average RMS: ${avgRms.toFixed(4)}`);
          console.log(`Max RMS: ${maxRms.toFixed(4)}`);
          console.log(`Min RMS: ${minRms.toFixed(4)}`);
          console.log(`Variance: ${variance.toFixed(6)}`);
          
          // Pass criteria: Variance > 0.0001 (indicates changing audio)
          // and Max RMS > 0.01 (indicates audio is present)
          const hasVariance = variance > 0.0001;
          const hasAudio = maxRms > 0.01;
          
          if (hasVariance && hasAudio) {
            console.log('✅ PASS: Audio byte stream is changing (audio detected)');
            resolve({ success: true, samples, avgRms, maxRms, variance });
          } else if (!hasAudio) {
            console.log('❌ FAIL: No audio detected (max RMS too low)');
            resolve({ success: false, reason: 'No audio detected', samples, avgRms, maxRms, variance });
          } else {
            console.log('❌ FAIL: Audio byte stream not changing (variance too low)');
            resolve({ success: false, reason: 'No variance in audio', samples, avgRms, maxRms, variance });
          }
        }
      }, interval);
    });
  }

  /**
   * Test 4: Fallback to microphone capture
   */
  async testMicrophoneFallback() {
    console.log('\n=== Test 4: Microphone Fallback ===');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });

      console.log('✅ Microphone access granted');
      console.log('   Speak into your microphone...');
      
      // Clean up previous audio context if exists
      if (this.audioContext) {
        this.audioContext.close();
      }
      
      this.mediaStream = stream;
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      
      source.connect(this.analyser);
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      
      return { success: true };
    } catch (error) {
      console.error('❌ Microphone fallback failed:', error.message);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    console.log('\n=== Cleanup ===');
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      console.log('✅ Media stream stopped');
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      console.log('✅ Audio context closed');
    }
  }

  /**
   * Run full test suite
   */
  async runFullTest() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║   Windows Audio Capture Validation Test               ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    
    const testResult = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      systemInfo: {
        nodeVersion: process.version,
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome
      },
      tests: {}
    };

    // Test 1: Enumerate sources
    const enumResult = await this.enumerateAudioSources();
    testResult.tests.enumeration = enumResult;

    if (enumResult.success && enumResult.sources.length > 0) {
      // Test 2 & 3: Capture and monitor
      const captureResult = await this.captureSystemAudio(enumResult.sources[0].id);
      testResult.tests.capture = captureResult;

      if (captureResult.success) {
        const monitorResult = await this.monitorByteStream(10);
        testResult.tests.monitor = monitorResult;
        
        if (!monitorResult.success) {
          // Test 4: Try microphone fallback
          console.log('\n⚠️  System audio capture failed, testing microphone fallback...');
          const fallbackResult = await this.testMicrophoneFallback();
          testResult.tests.microphoneFallback = fallbackResult;
          
          if (fallbackResult.success) {
            const micMonitorResult = await this.monitorByteStream(5);
            testResult.tests.microphoneMonitor = micMonitorResult;
          }
        }
      }
    } else {
      // No system audio sources, go straight to microphone
      console.log('\n⚠️  No system audio sources, testing microphone fallback...');
      const fallbackResult = await this.testMicrophoneFallback();
      testResult.tests.microphoneFallback = fallbackResult;
      
      if (fallbackResult.success) {
        const micMonitorResult = await this.monitorByteStream(5);
        testResult.tests.microphoneMonitor = micMonitorResult;
      }
    }

    this.cleanup();

    // Final verdict
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║   Test Results Summary                                 ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    
    const systemAudioWorks = testResult.tests.monitor?.success || false;
    const microphoneWorks = testResult.tests.microphoneMonitor?.success || false;
    
    if (systemAudioWorks) {
      console.log('✅ OVERALL: PASS - System audio capture working');
      testResult.verdict = 'PASS';
      testResult.method = 'system_audio';
    } else if (microphoneWorks) {
      console.log('⚠️  OVERALL: PARTIAL PASS - Microphone fallback working');
      testResult.verdict = 'PARTIAL_PASS';
      testResult.method = 'microphone_fallback';
    } else {
      console.log('❌ OVERALL: FAIL - Neither system audio nor microphone working');
      testResult.verdict = 'FAIL';
      testResult.method = 'none';
    }

    return testResult;
  }
}

// Export for use in Electron app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioCaptureTest;
}
