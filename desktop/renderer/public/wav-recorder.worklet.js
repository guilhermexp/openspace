/* global AudioWorkletProcessor, registerProcessor */
class WavRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      const copy = new Float32Array(channel);
      this.port.postMessage({ samples: copy }, [copy.buffer]);
    }
    return true;
  }
}

registerProcessor("wav-recorder-processor", WavRecorderProcessor);
