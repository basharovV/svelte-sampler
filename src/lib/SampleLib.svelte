<script context="module">
	export const prerender = true;
</script>

<script lang="ts">
	import * as pkg from '@tonejs/midi';
	const { Midi } = pkg;
	import { onMount } from 'svelte';
	import * as Tone from 'tone';
	import { Input, WebMidi } from 'webmidi';
	import { generateKeys } from './KeyMap';

	interface SamplesMap {
		[note: string]: string;
	}

	let isLoadingSamples = false;
	let samplesLoaded = false;
	let sampler: Tone.Sampler;
	let reverb: Tone.Reverb;
	let isSustaining = false;

	export let samplesPath;
	export let startNote = 'E1';
	export let endNote = 'E7';
	export let urls: SamplesMap;
	export let theme: 'light' | 'grey' | 'dark' = 'grey';

	// Reverb
	export let reverbOn = false;
	let reverbWetSignal = 0;
	const REVERB_ON_WET_AMOUNT = 0.4;

	// Validate params
	if (!urls) {
		throw new TypeError('SampleLib: urls not provided in <SampleLib urls={urls}>');
	}

	async function enableMidi() {
		await WebMidi.enable();
	}

	/**
	 * Create a list of keys to play the sample library
	 */
	let keys;

	onMount(() => {
		keys = generateKeys(startNote, endNote);
		enableMidi();
	});

	// MIDI inputs
	export let inputId;
	let input: Input;

	// MIDI listener
	$: {
		if (input) {
			input.removeListener();
		}

		if (WebMidi.enabled && inputId !== undefined) {
			input = WebMidi.getInputById(inputId);

			if (input) {
				input.addListener('noteon', (e) => {
					let note = Tone.Frequency(e.note.number, 'midi').toNote();
					noteDown(note);
					notesPlaying.push(note);
					notesPlaying = notesPlaying;
				});
				input.addListener('noteoff', (e) => {
					let note = Tone.Frequency(e.note.number, 'midi').toNote();
					noteUp(note);
					notesPlaying.splice(
						notesPlaying.findIndex((n) => note === n),
						1
					);
					notesPlaying = notesPlaying;
				});
				input.addListener('controlchange', (e) => {
					if (e.subtype === 'holdpedal') {
						if (e.value === 1) {
							isSustaining = true;
							// Add any existing notes to array
							notesSustainedToLetGo.push(
								...notesPlaying.filter((n) => !notesSustainedToLetGo.includes(n))
							);
							notesSustainedToLetGo = notesSustainedToLetGo;
						} else if (e.value === 0) {
							isSustaining = false;
							const notesToLetGo = notesSustainedToLetGo.filter((n) => !notesPlaying.includes(n));
							sampler.triggerRelease(notesToLetGo);
							notesSustainedToLetGo = notesSustainedToLetGo.filter((n) => notesPlaying.includes(n));
							notesSustainedToLetGo = notesSustainedToLetGo;
							notesSustainedDisplay = notesSustainedToLetGo;
						}
					}
				});
			}
		}
	}

	/**
	 * Plays a MIDI file from start to finish,
	 * updating the notes being played in real time.
	 * @param midiFile
	 */
	export const playMidiFile = async (midiFile) => {
		if (!samplesLoaded) await init();

		const midi = await Midi.fromUrl(midiFile);

		let now = Tone.getContext().transport.now();
		const drawNow = Tone.Draw.now();
		const compensation = 0.07;

		Tone.getContext().transport.on('start', (time) => {
			now = time;

			midi.tracks[0].notes.forEach((note, idx) => {
				Tone.getContext().transport.scheduleOnce((time) => {

					// Note down
					sampler.triggerAttack(note.name, Tone.now(), note.velocity);

					// Note up (+ sustain handling)
					Tone.getContext().transport.scheduleOnce((time) => {
						if (isSustaining) {
							notesSustainedToLetGo.push(note);
							notesSustainedToLetGo = notesSustainedToLetGo;
						} else {
							sampler.triggerRelease(note.name, Tone.now());
						}
					}, Tone.now() + note.duration);

					Tone.Draw.schedule(function () {
						notesPlaying.push(note.name);
						notesPlaying = notesPlaying;
					}, Tone.Draw.now() - compensation);

					Tone.Draw.schedule(function () {
						notesPlaying.splice(
							notesPlaying.findIndex((n) => note.name === n),
							1
						);
						notesPlaying = notesPlaying;

						if (idx === midi.tracks[0].notes.length - 1) {
							stop();
						}
					}, Tone.Draw.now() + note.duration - compensation);
				}, now + note.time);
			});
			// midi.tracks[0].controlChanges[64].forEach((sustain) => {
			// 	Tone.getContext().transport.scheduleOnce((time) => {
			// 		console.log('pedal!', sustain);
			// 		if (sustain.value === 1) {
			// 			isSustaining = true;
			// 			// Add any existing notes to array
			// 			notesSustainedToLetGo.push(
			// 				...notesPlaying.filter((n) => !notesSustainedToLetGo.includes(n))
			// 			);
			// 			notesSustainedToLetGo = notesSustainedToLetGo;
			// 		} else if (sustain.value === 0) {
			// 			isSustaining = false;
			// 			console.log('notes sustained', notesSustainedToLetGo);
			// 			console.log('notes playinh', notesPlaying);
			// 			sampler.triggerRelease(notesSustainedToLetGo);
			// 			notesSustainedToLetGo = notesSustainedToLetGo.filter((n) => notesPlaying.includes(n));
			// 			notesSustainedToLetGo = notesSustainedToLetGo;

			// 			console.log('notes sustained after', notesSustainedToLetGo);
			// 		}
			// 	}, now + sustain.time);
			// });
		});

		Tone.getContext().transport.start(now, now);
	};

	export const stop = () => {
		Tone.getContext().transport.cancel(Tone.now());
		Tone.getContext().transport.stop(Tone.now());
		Tone.getContext().transport.off('start');
		notesPlaying = [];
		Tone.Draw.cancel(Tone.now());
	};

	export const toggleReverb = () => {
		reverbOn = !reverbOn;
		reverbWetSignal = reverbOn ? REVERB_ON_WET_AMOUNT : 0;
		if (reverb) reverb.set({ wet: reverbWetSignal });
	};

	// SETTINGS

	let bpm = 100; // Beats per minute
	let vol = 0; // Volume
	let timeSig = '4/4';

	$: notesPlaying = [];
	$: notesSustainedToLetGo = [];
	$: notesSustainedDisplay = [];
	$: soloNotesPlaying = [];

	async function playNote(note, duration, time) {
		if (sampler) {
			sampler.triggerAttack(note, time);
			sampler.triggerRelease(note, duration);
		} else {
			await init();
		}
	}

	function noteDown(note) {
		if (!sampler) init();
		else if (samplesLoaded) {
			sampler.triggerAttack(note, Tone.now());
		}
	}

	function noteUp(note) {
		if (!sampler) init();
		else if (samplesLoaded) {
			if (isSustaining) {
				notesSustainedToLetGo.push(note);
				notesSustainedToLetGo = notesSustainedToLetGo;
				notesSustainedDisplay = notesSustainedToLetGo;
			} else {
				notesSustainedToLetGo = notesSustainedToLetGo.filter((n) => n !== note);
				sampler.triggerRelease(note);
			}
		}
	}

	async function init() {
		await initTone();
		await initFx();
		await initSampleLibrary();
	}

	async function initFx() {
		reverb = new Tone.Reverb({ wet: reverbWetSignal, decay: 2, preDelay: 0.2 }).toDestination();
	}

	async function initSampleLibrary() {
		isLoadingSamples = true;

		Object.entries(urls).forEach((url) => {
			urls[url[0]] = encodeURIComponent(url[1]);
		});

		return new Promise<void>((resolve, reject) => {
			sampler = new Tone.Sampler({
				context: Tone.getContext(),
				onerror: (err) => {
					console.error(err);
					reject(err);
				},
				volume: 10,
				urls,
				baseUrl: samplesPath,
				onload: () => {
					isLoadingSamples = false;
					samplesLoaded = true;
					resolve();
				}
			}).connect(reverb);
		});
	}

	async function initTone() {
		await Tone.start();
		if (!Tone.getContext().disposed) Tone.getContext().dispose();
		// Tone.setContext(new Tone.OfflineContext(1, 0.5, 44100));
		Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: 0 }));
		// Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: 5}));
		Tone.getContext().transport.bpm.value = bpm;
		Tone.getDestination().volume.value = vol;
		Tone.getContext().transport.timeSignature = timeSig.split('/').map((t) => parseInt(t));
	}

	let isDragging = false;

	function onStopDrag() {
		sampler?.releaseAll();
		isDragging = false;
	}
</script>

<div class="container" on:mouseup={onStopDrag}>
	{#if isLoadingSamples}
		<p style="position: absolute;margin: auto;top: -3em;">Loading samples...</p>
	{/if}

	<piano
		class:loading={isLoadingSamples}
		class:theme-light={theme === 'light'}
		class:theme-dark={theme === 'dark'}
		class:theme-grey={theme === 'grey'}
		on:mouseleave={() => {
			isDragging = false;
		}}
	>
		{#if keys}
			<div class="white-keys">
				{#each keys.filter((k) => !k.isBlack) as whiteKey, index}
					<div
						class="white-key {whiteKey.key}"
						class:playing={notesPlaying.includes(whiteKey.key)}
						class:sustained={notesSustainedDisplay.includes(whiteKey.key)}
						on:mousedown={() => {
							noteDown(whiteKey.key);
							isDragging = true;
						}}
						on:mouseup={() => {
							noteUp(whiteKey.key);
							onStopDrag();
						}}
						on:mouseenter={() => {
							if (isDragging) noteDown(whiteKey.key);
						}}
					/>
				{/each}
			</div>
			<div class="black-keys">
				{#each keys.filter((k) => k.isBlack) as blackKey}
					<div
						class="black-key {blackKey.key.replace('#', 's')}"
						class:playing={notesPlaying.includes(blackKey.key)}
						class:sustained={notesSustainedDisplay.includes(blackKey.key)}
						style="left: {blackKey.x}px;"
						on:mousedown={() => {
							noteDown(blackKey.key);
							isDragging = true;
						}}
						on:mouseup={() => {
							noteUp(blackKey.key);
							onStopDrag();
						}}
						on:mouseenter={() => {
							if (isDragging) noteDown(blackKey.key);
						}}
					/>
				{/each}
			</div>
		{/if}
	</piano>
</div>

<style lang="scss">
	:global(body, html) {
		margin: 0;
		height: 100%;
	}

	.device-picker {
		margin-top: 1em;
		float: right;
	}

	.container {
		overflow: auto;
		display: block;
		height: 100%;
		width: 100%;
		margin: auto;
		position: relative;
		max-width: 1040px;
		overflow: visible;
	}

	.settings {
		margin: 2em auto 0;
		display: flex;
		justify-content: center;
		gap: 1em;
		display: none;
	}

	piano {
		min-height: 100px;
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: flex-start;
		margin: 3em auto 0;
		position: relative;
		width: fit-content;
		pointer-events: auto;
		box-sizing: border-box;
		box-shadow: 40px 30px 100px 0px black;
		opacity: 0;
		animation: fadeIn 0.5s 0.3s ease-in forwards;
		&.loading {
			opacity: 0.5;
			pointer-events: none;
		}

		@keyframes fadeIn {
			from {
				opacity: 0;
			}
			to {
				opacity: 1;
			}
		}

		.black-keys {
			position: absolute;
			top: -10px;
			height: 75px;
		}

		.white-keys {
			position: relative;
			display: flex;
			flex-direction: row;
			height: 100px;
		}

		.white-key {
			position: relative;
			width: 20px;
			margin: 0 2px;
			box-sizing: border-box;
			height: 100%;
			border: 1px inset rgb(156, 156, 156);
			border-radius: 4px;
			background-color: #6663636d;
			box-sizing: border-box;
			pointer-events: auto;
			box-shadow: none;

			&.solo-playing {
				background-color: rgb(0, 255, 60);
			}

			&.playing {
				background-color: rgb(188, 0, 38);
				box-shadow: 1px 1px 15px 15px rgba(188, 0, 38, 0.248);
				transform: translateY(2px);
			}

			&.sustained {
				background-color: rgb(144, 84, 77);
			}

			&.dragging {
				pointer-events: none;
			}

			&:hover {
				background-color: #53aa8b;
			}
			&:active {
				background-color: red;
				transform: translateY(2px);
			}
		}

		&.theme-light .white-key {
			background-color: white;

			&.solo-playing {
				background-color: rgb(0, 255, 60);
			}

			&.playing {
				background-color: rgb(188, 0, 38);
			}

			&:hover {
				background-color: #53aa8b;
			}
			&:active {
				background-color: red;
				transform: translateY(2px);
			}
		}

		.black-key {
			z-index: 1;
			position: absolute;
			width: 16px;
			height: 100%;
			border: 1px inset rgb(92, 88, 88);
			background: rgb(20, 20, 20);
			border-bottom-left-radius: 3px;
			border-bottom-right-radius: 3px;
			border-top-right-radius: 3px;
			border-top-left-radius: 3px;
			box-shadow: 0px 0px 1px rgba(0, 0, 0, 0.474);
			&.playing {
				background-color: rgb(188, 0, 38);
				box-shadow: 1px 1px 15px 15px rgba(188, 0, 38, 0.248);
				transform: translateY(2px);
			}

			&.sustained {
				background-color: rgb(144, 84, 77);
			}

			&.solo-playing {
				background-color: rgb(0, 255, 60);
			}

			&.dragging {
				pointer-events: none;
			}

			&:hover {
				background-color: #53aa8b;
			}

			&:active {
				background-color: red;
				transform: translateY(1px);
			}
		}
	}
</style>
