<script lang="ts">
  import BlogPostEditor from "$lib/components/blog/BlogPostEditor.svelte";

  import { page } from "$app/stores";
  
  const postId = $page.params.id;
</script>

<BlogPostEditor {postId} />
