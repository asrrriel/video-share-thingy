<script lang="ts">
	let files: FileList;

	let links = new Array<[String, string]>();

	let n_loading = 0;

	async function upload() {
		for (const file of files) {
			++n_loading;

			const response = await fetch(`/${file.name}`, {
				method: 'PUT',
				headers: {
					'Content-Type': String(file.type),
					'Content-Length': String(file.size),
				},
				body: file,
			});

			const { url } = await response.json();

			links = [...links, [file.name, url]];

			--n_loading;
		}
	}

	const target = '_blank';
	const rel = 'noreferrer noopener';
</script>

<main>
	{#if n_loading}
		<h1>Uploading...</h1>
	{/if}

	<input type="file" multiple bind:files on:change={upload} />

	<ul>
		{#each links as [name, url]}
			<li>
				<a href={url} {target} {rel}>{name}</a>
			</li>
		{/each}
	</ul>
</main>
