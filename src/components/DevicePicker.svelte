<script lang="ts">
	import { Input, Output, WebMidi } from 'webmidi';
	export let type: 'input' | 'output';
	export let value: string = null;
	type device = Input | Output;
	let devices: device[] = type === 'input' ? WebMidi.inputs : WebMidi.outputs;
	WebMidi.addListener('connected', () => {
		devices = type === 'input' ? WebMidi.inputs : WebMidi.outputs;
	});
	WebMidi.addListener('disconnected', () => {
		devices = type === 'input' ? WebMidi.inputs : WebMidi.outputs;
		if (!devices.find((d) => d.id === value)) {
			value = null;
		}
	});
</script>

<select bind:value>
	<option value={null}>None</option>

	{#each devices as device}
		<option value={device.id}>
			{device.name}
		</option>
	{/each}
</select>

<style>
	select {
		background: #090909;
		border-radius: 2px;
		padding: 0.2em;
		color: #53aa8b;
		font-family: 'Lunatic Superstar', Tahoma, Geneva, Verdana, sans-serif;
		font-size: 20px;
	}
</style>
