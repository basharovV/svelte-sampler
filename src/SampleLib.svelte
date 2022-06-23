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

	export let samplesPath;
	export let startNote = 'E1';
	export let endNote = 'E7';
	export let urls: SamplesMap;

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
					console.log('note', note);
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
				input.addListener('controlchange-controller64', (e) => {
					console.log('PEDAL', e);
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

		const now = sampler.now();
		midi.tracks[0].notes.forEach((note) => {
			sampler.triggerAttackRelease(note.name, note.duration, note.time + now, note.velocity);

			Tone.Draw.schedule(function () {
				notesPlaying.push(note.name);
				notesPlaying = notesPlaying;
			}, note.time + now);

			Tone.Draw.schedule(function () {
				notesPlaying.splice(
					notesPlaying.findIndex((n) => note.name === n),
					1
				);
				notesPlaying = notesPlaying;
			}, note.time + now + note.duration);
		});
	};

	// SETTINGS

	let bpm = 100; // Beats per minute
	let vol = 0; // Volume
	let timeSig = '4/4';

	$: notesPlaying = [];
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
			sampler.triggerAttack(note);
		}
	}

	function noteUp(note) {
		if (!sampler) init();
		else if (samplesLoaded) {
			sampler.triggerRelease(note);
		}
	}

	async function init() {
		await initTone();
		await initSampleLibrary();
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
				urls,
				baseUrl: samplesPath,
				onload: () => {
					isLoadingSamples = false;
					samplesLoaded = true;
					console.log('loaded');
					resolve();
				}
			}).toDestination();
		});
	}

	async function initTone() {
		await Tone.start();
		Tone.getContext().dispose();
		// Tone.setContext(new Tone.OfflineContext(1, 0.5, 44100));
		Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: Tone.immediate() }));
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
		<p>Loading samples...</p>
	{/if}

	<div
		class="piano {isLoadingSamples ? 'loading' : ''}"
		on:mouseleave={() => {
			isDragging = false;
		}}
	>
		{#if keys}
			<div class="white-keys">
				{#each keys.filter((k) => !k.isBlack) as whiteKey}
					<div
						class="white-key {whiteKey.key} {notesPlaying.includes(whiteKey.key)
							? 'playing'
							: ''} {soloNotesPlaying.includes(whiteKey.key) ? 'solo-playing' : ''}"
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
						class="black-key {blackKey.key.replace('#', 's')} {notesPlaying.includes(blackKey.key)
							? 'playing'
							: ''} {soloNotesPlaying.includes(blackKey.key) ? 'solo-playing' : ''}"
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
	</div>
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
	}

	.settings {
		margin: 2em auto 0;
		display: flex;
		justify-content: center;
		gap: 1em;
		display: none;
	}

	.piano {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		align-items: flex-start;
		margin: 3em auto 0;
		position: relative;
		width: fit-content;
		pointer-events: auto;

		&.loading {
			opacity: 0.5;
			pointer-events: none;
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
			border: 1px solid rgb(89, 84, 84);
			border-radius: 4px;
			background: #252525;
			box-sizing: border-box;
			pointer-events: auto;
			box-shadow: none;

			&.solo-playing {
				background-color: rgb(0, 255, 60);
			}

			&.playing {
				background-color: rgb(188, 0, 38);
				box-shadow: 1px 1px 15px 15px rgba(188, 0, 38, 0.248);
			}

			&.dragging {
				pointer-events: none;
			}

			&:hover {
				background-color: #53aa8b;
			}
			&:active {
				background-color: red;
			}
		}

		.black-key {
			z-index: 1;
			position: absolute;
			width: 18px;
			height: 100%;
			border: 1px solid #313131;
			background: black;
			border-bottom-left-radius: 3px;
			border-bottom-right-radius: 3px;
			border-top-right-radius: 3px;
			border-top-left-radius: 3px;
			box-shadow: none;
			&.playing {
				background-color: rgb(188, 0, 38);
				box-shadow: 1px 1px 15px 15px rgba(188, 0, 38, 0.248);
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
			}
		}
	}
</style>
