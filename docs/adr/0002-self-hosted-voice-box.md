# Speech is transcribed by OpenAI; interpretation is DeepSeek behind the box

The live site is static GitHub Pages. The browser streams PCM to an always-on box over WebSocket. The box proxies **OpenAI Realtime transcription** (`gpt-live-transcribe`) and shows transcript deltas in the Voice Surface as they arrive. On each completed turn, **DeepSeek** (`deepseek-chat`) picks a Show or a Clarification. API keys stay on the box. Audio goes to OpenAI; the transcript goes to DeepSeek; the box does not keep audio. Silence does not Show a Section. The box allows only the site origins and rate-limits.
