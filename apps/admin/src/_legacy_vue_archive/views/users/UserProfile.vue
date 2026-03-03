<template>
  <div class="space-y-6 animate-fade-in">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 rounded-full bg-gremius-subtle flex items-center justify-center text-xl font-bold text-gremius-text">
          {{ user?.displayName?.charAt(0) || '?' }}
        </div>
        <div>
          <h1 class="text-2xl font-bold text-white">{{ user?.displayName || 'Loading...' }}</h1>
          <p class="text-sm text-gremius-text-dim flex items-center gap-2">
            <Mail class="w-3 h-3" /> {{ user?.email }}
            <span class="w-1 h-1 rounded-full bg-gremius-text-dim/50" />
            <span class="capitalize">{{ user?.role }}</span>
          </p>
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <!-- Module Injection Point: Action Buttons -->
        <ModuleInjection location="user_profile_primary_action" :user="user" />
        
        <button class="btn-ghost">Edit Profile</button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
       <!-- Main Content -->
       <div class="lg:col-span-2 space-y-6">
          <div class="card p-6">
             <h3 class="font-semibold mb-4 text-lg">Activity</h3>
             <div class="text-center py-10 text-gremius-text-dim bg-gremius-bg/30 rounded-lg">
                No recent activity
             </div>
          </div>
          
          <!-- Module Injection Point: Main Content Area -->
          <ModuleInjection location="user_profile_content" :user="user" />
       </div>

       <!-- Sidebar -->
       <div class="space-y-6">
          <div class="card p-6">
            <h3 class="font-semibold mb-4">Details</h3>
            <div class="space-y-3 text-sm">
               <div class="flex justify-between py-2 border-b border-gremius-border/50">
                 <span class="text-gremius-text-dim">User ID</span>
                 <span class="font-mono text-xs">{{ user?.id }}</span>
               </div>
               <div class="flex justify-between py-2 border-b border-gremius-border/50">
                 <span class="text-gremius-text-dim">Joined</span>
                 <span>{{ new Date(user?.createdAt).toLocaleDateString() }}</span>
               </div>
            </div>
          </div>

          <!-- Module Injection Point: Sidebar -->
          <ModuleInjection location="user_profile_sidebar" :user="user" />
       </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { Mail } from 'lucide-vue-next';
import { useApi } from '../../composables/useApi';
import ModuleInjection from '../../components/modules/ModuleInjection.vue';

const route = useRoute();
const api = useApi();
const user = ref<any>(null);
const loading = ref(true);

onMounted(async () => {
   try {
     const userId = route.params.id;
     user.value = {
        id: userId,
        displayName: 'Test User',
        email: 'test@example.com',
        role: 'editor',
        createdAt: new Date().toISOString()
     };
   } catch(e) {
     console.error(e);
   } finally {
     loading.value = false;
   }
});
</script>
