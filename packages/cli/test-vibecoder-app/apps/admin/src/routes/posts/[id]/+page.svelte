<script lang="ts">
  import { page } from "$app/stores";
  import BlogPostEditor from "$lib/components/blog/BlogPostEditor.svelte";
  
  const postId = $page.params.id;
</script>

<BlogPostEditor {postId} />
