<template>
  <div class="space-y-4 animate-fade-in">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <router-link to="/posts" class="btn-ghost btn-sm"><ArrowLeft class="w-4 h-4" /> Posts</router-link>
        <StatusBadge :status="form.status" />
      </div>
      <div class="flex items-center gap-2">
        <button @click="saveDraft" class="btn-secondary btn-sm" :disabled="saving">
          <Save class="w-3.5 h-3.5" /> Save Draft
        </button>
        <button @click="publish" class="btn-primary btn-sm" :disabled="saving">
          <Send class="w-3.5 h-3.5" /> Publish
        </button>
      </div>
    </div>

    <!-- Tab Bar -->
    <div class="flex items-center gap-1 bg-gremius-card rounded-xl border border-gremius-border p-1">
      <button
        @click="activeTab = 'editor'"
        :class="[
          'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
          activeTab === 'editor'
            ? 'bg-gremius-cyan/10 text-gremius-cyan border border-gremius-cyan/20'
            : 'text-gremius-text-dim hover:text-gremius-text border border-transparent',
        ]"
      >
        <FileEdit class="w-4 h-4" /> Content Editor
      </button>
      <button
        @click="activeTab = 'builder'"
        :class="[
          'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
          activeTab === 'builder'
            ? 'bg-gremius-pink/10 text-gremius-pink border border-gremius-pink/20'
            : 'text-gremius-text-dim hover:text-gremius-text border border-transparent',
        ]"
      >
        <LayoutGrid class="w-4 h-4" /> Layout Builder
        <span v-if="form.blocks.length > 0" class="badge-pink text-[9px] py-0">{{ form.blocks.length }}</span>
      </button>
      <button
        @click="activeTab = 'seo'"
        :class="[
          'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
          activeTab === 'seo'
            ? 'bg-gremius-green/10 text-gremius-green border border-gremius-green/20'
            : 'text-gremius-text-dim hover:text-gremius-text border border-transparent',
        ]"
      >
        <Globe class="w-4 h-4" /> SEO & Settings
      </button>
    </div>

    <!-- ═══ Tab: Content Editor ═══ -->
    <div v-show="activeTab === 'editor'">
      <div class="grid grid-cols-[1fr_340px] gap-6">
        <!-- Main editor column -->
        <div class="space-y-4">
          <!-- Title -->
          <input
            v-model="form.title"
            @input="autoSlug"
            class="w-full bg-transparent text-3xl font-bold outline-none placeholder:text-gremius-muted/50 leading-tight"
            placeholder="Post title..."
          />

          <!-- Tags bar -->
          <div class="flex items-center gap-2 flex-wrap">
            <span
              v-for="(tag, i) in form.tags"
              :key="i"
              class="badge-cyan flex items-center gap-1"
            >
              {{ tag }}
              <button @click="form.tags.splice(i, 1)" class="hover:text-white"><X class="w-2.5 h-2.5" /></button>
            </span>
            <input
              v-model="tagInput"
              @keydown.enter.prevent="addTag"
              @keydown.comma.prevent="addTag"
              class="bg-transparent text-xs outline-none text-gremius-text-dim placeholder:text-gremius-subtle w-24"
              placeholder="Add tag..."
            />
          </div>

          <!-- Content editor -->
          <div class="card overflow-hidden">
            <!-- Toolbar -->
            <div class="flex items-center gap-1 px-4 py-2 border-b border-gremius-border bg-gremius-card">
              <button v-for="btn in editorTools" :key="btn.label" @click="insertMarkdown(btn.md)" class="btn-icon p-1.5 rounded-md" :title="btn.label">
                <component :is="btn.icon" class="w-3.5 h-3.5" />
              </button>
              <span class="mx-2 w-px h-4 bg-gremius-border" />
              <button
                @click="showPreview = !showPreview"
                :class="['btn-icon p-1.5 rounded-md', showPreview && 'bg-gremius-cyan/10 text-gremius-cyan']"
                title="Toggle preview"
              >
                <Eye class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Editor area -->
            <div :class="showPreview ? 'grid grid-cols-2 divide-x divide-gremius-border' : ''">
              <textarea
                ref="editorRef"
                v-model="form.content"
                class="w-full min-h-[500px] bg-gremius-bg p-6 text-sm leading-relaxed font-mono outline-none resize-none placeholder:text-gremius-subtle"
                placeholder="Start writing your post in Markdown..."
              />
              <div v-if="showPreview" class="p-6 prose prose-invert prose-sm max-w-none overflow-y-auto max-h-[500px]" v-html="renderedContent" />
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-between px-4 py-2 border-t border-gremius-border text-[11px] text-gremius-subtle bg-gremius-card">
              <span>{{ wordCount }} words · {{ readingTime }} min read</span>
              <span class="font-mono">Markdown</span>
            </div>
          </div>
        </div>

        <!-- Sidebar excerpt -->
        <div class="space-y-4">
          <div class="card p-5">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gremius-text-dim flex items-center gap-2 mb-3">
              <FileText class="w-3.5 h-3.5" /> Excerpt
            </h3>
            <textarea
              v-model="form.excerpt"
              class="textarea bg-gremius-bg text-xs"
              rows="3"
              placeholder="Short summary for cards and SEO..."
            />
          </div>
          <div class="card p-5">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gremius-text-dim flex items-center gap-2 mb-3">
              <ImageIcon class="w-3.5 h-3.5" /> Featured Image
            </h3>
            <input
              v-model="form.featuredImageUrl"
              type="url"
              class="input bg-gremius-bg text-xs"
              placeholder="https://..."
            />
            <div v-if="form.featuredImageUrl" class="mt-3 rounded-lg border border-gremius-border overflow-hidden">
              <img :src="form.featuredImageUrl" class="w-full h-32 object-cover" @error="($event.target as HTMLImageElement).style.display='none'" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Tab: Layout Builder ═══ -->
    <div v-show="activeTab === 'builder'">
      <PageBuilder v-model="form.blocks" />
    </div>

    <!-- ═══ Tab: SEO & Settings ═══ -->
    <div v-show="activeTab === 'seo'">
      <div class="grid grid-cols-[1fr_340px] gap-6">
        <div class="card p-6">
          <SEOAnalyzer v-model="seoData" />
        </div>
        <div class="space-y-4">
          <div class="card p-5 space-y-4">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gremius-text-dim flex items-center gap-2">
              <Settings2 class="w-3.5 h-3.5" /> Publish Settings
            </h3>
            <div>
              <label class="label mb-1.5 block">Status</label>
              <select v-model="form.status" class="select bg-gremius-bg">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </div>
            <div v-if="form.status === 'scheduled'">
              <label class="label mb-1.5 block">Publish Date</label>
              <input v-model="form.publishedAt" type="datetime-local" class="input bg-gremius-bg" />
            </div>
            <div>
              <label class="label mb-1.5 block">Author</label>
              <input v-model="form.authorName" class="input bg-gremius-bg" placeholder="Author name" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, markRaw } from "vue";
import {
  ArrowLeft, Save, Send, X, Eye, Settings2,
  Bold, Italic, Heading2, Link2, ImageIcon, List, Code2, Quote,
  FileEdit, LayoutGrid, Globe, FileText,
} from "lucide-vue-next";
import StatusBadge from "../components/ui/StatusBadge.vue";
import SEOAnalyzer, { type SEOData } from "../components/ui/SEOAnalyzer.vue";
import PageBuilder from "../components/builder/PageBuilder.vue";
import type { PageBlock } from "../types/blocks";

const saving = ref(false);
const showPreview = ref(false);
const editorRef = ref<HTMLTextAreaElement>();
const tagInput = ref("");
const activeTab = ref<"editor" | "builder" | "seo">("editor");

const form = ref({
  title: "",
  content: "",
  excerpt: "",
  featuredImageUrl: "",
  status: "draft" as "draft" | "published" | "scheduled",
  tags: [] as string[],
  publishedAt: "",
  authorName: "Admin",
  blocks: [] as PageBlock[],
});

const seoData = ref<SEOData>({
  title: "",
  slug: "",
  seoTitle: "",
  seoDescription: "",
  ogImageUrl: "",
});

watch(() => form.value.title, (title) => {
  seoData.value.title = title;
  seoData.value.slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!seoData.value.seoTitle || seoData.value.seoTitle === seoData.value.title) {
    seoData.value.seoTitle = title;
  }
});

function autoSlug() { /* handled by watch */ }

function addTag() {
  const tag = tagInput.value.trim().replace(/,$/, "");
  if (tag && !form.value.tags.includes(tag)) form.value.tags.push(tag);
  tagInput.value = "";
}

const wordCount = computed(() => {
  const text = form.value.content.trim();
  return text ? text.split(/\s+/).length : 0;
});
const readingTime = computed(() => Math.max(1, Math.ceil(wordCount.value / 250)));

const renderedContent = computed(() => {
  let html = form.value.content
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="text-gremius-cyan bg-gremius-bg px-1 rounded">$1</code>')
    .replace(/^\\> (.+)$/gm, '<blockquote class="border-l-2 border-gremius-cyan pl-4 text-gremius-text-dim italic">$1</blockquote>')
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
  return `<p>${html}</p>`;
});

const editorTools = [
  { label: "Bold", icon: markRaw(Bold), md: "**bold**" },
  { label: "Italic", icon: markRaw(Italic), md: "*italic*" },
  { label: "Heading", icon: markRaw(Heading2), md: "## " },
  { label: "Link", icon: markRaw(Link2), md: "[text](url)" },
  { label: "Image", icon: markRaw(ImageIcon), md: "![alt](url)" },
  { label: "List", icon: markRaw(List), md: "- " },
  { label: "Code", icon: markRaw(Code2), md: "`code`" },
  { label: "Quote", icon: markRaw(Quote), md: "> " },
];

function insertMarkdown(md: string) {
  const el = editorRef.value;
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const text = form.value.content;
  form.value.content = text.substring(0, start) + md + text.substring(end);
  el.focus();
  setTimeout(() => { el.selectionStart = el.selectionEnd = start + md.length; }, 0);
}

async function saveDraft() {
  saving.value = true;
  form.value.status = "draft";
  // TODO: API call with form.value.blocks included
  setTimeout(() => { saving.value = false; }, 500);
}

async function publish() {
  saving.value = true;
  form.value.status = "published";
  form.value.publishedAt = new Date().toISOString();
  // TODO: API call with form.value.blocks included
  setTimeout(() => { saving.value = false; }, 500);
}
</script>
