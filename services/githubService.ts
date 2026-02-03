import { VersionInfo, AppSettings } from '../types';

const REPO_OWNER = 'comfyanonymous';
const REPO_NAME = 'ComfyUI';
const BASE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

// Empty settings for git commands (will use portable paths by default)
const emptySettings: AppSettings = {
  pythonPath: '',
  gitPath: '',
  customArgs: '',
  useGitHubProxy: false,
  psPluginPath: '',
  useGithubMirror: false,
  githubMirrorUrl: '',
  usePypiMirror: false,
  pypiMirrorUrl: '',
  useHfMirror: false,
  hfMirrorUrl: ''
};

// Persistent cache using localStorage
const CACHE_KEY_PREFIX = 'comfyui_versions_';
const CACHE_KEY_TIMESTAMP = 'comfyui_versions_timestamp';

interface CacheData {
  stable: VersionInfo[];
  dev: VersionInfo[];
  timestamp: number;
}

function getAllCache(): CacheData | null {
  try {
    const stable = localStorage.getItem(CACHE_KEY_PREFIX + 'stable');
    const dev = localStorage.getItem(CACHE_KEY_PREFIX + 'dev');
    const timestamp = localStorage.getItem(CACHE_KEY_TIMESTAMP);

    if (stable && dev && timestamp) {
      return {
        stable: JSON.parse(stable),
        dev: JSON.parse(dev),
        timestamp: parseInt(timestamp)
      };
    }
  } catch (e) {
    console.error('[Cache] Read error:', e);
  }
  return null;
}

function setAllCache(stable: VersionInfo[], dev: VersionInfo[]): void {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + 'stable', JSON.stringify(stable));
    localStorage.setItem(CACHE_KEY_PREFIX + 'dev', JSON.stringify(dev));
    localStorage.setItem(CACHE_KEY_TIMESTAMP, Date.now().toString());
    console.log(`[Cache] Saved both lists - stable: ${stable.length}, dev: ${dev.length}`);
  } catch (e) {
    console.error('[Cache] Write error:', e);
  }
}

function clearAllCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY_PREFIX + 'stable');
    localStorage.removeItem(CACHE_KEY_PREFIX + 'dev');
    localStorage.removeItem(CACHE_KEY_TIMESTAMP);
    console.log('[Cache] Cleared all');
  } catch (e) {
    console.error('[Cache] Clear error:', e);
  }
}

function formatGitDate(gitDate: string): string {
  try {
    const date = new Date(gitDate.trim());
    return date.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
  } catch (e) {
    return gitDate;
  }
}

// Fetch all versions (both stable and dev) at once
export async function fetchAllVersions(forceRefresh = false): Promise<{ stable: VersionInfo[], dev: VersionInfo[] }> {
  console.log(`[fetchAllVersions] forceRefresh=${forceRefresh}`);

  // Check cache first (unless force refresh)
  const cached = getAllCache();
  if (!forceRefresh && cached && cached.stable.length > 0 && cached.dev.length > 0) {
    const ageMin = Math.floor((Date.now() - cached.timestamp) / 1000 / 60);
    console.log(`[fetchAllVersions] Using cache (stable: ${cached.stable.length}, dev: ${cached.dev.length}, age: ${ageMin}min)`);
    return { stable: cached.stable, dev: cached.dev };
  }

  // Force refresh: clear cache first
  if (forceRefresh) {
    clearAllCache();
  }

  console.log('[fetchAllVersions] Fetching fresh data...');

  // Fetch both in parallel
  const [stable, dev] = await Promise.all([
    fetchStableVersions(),
    fetchDevVersions()
  ]);

  // Save to cache
  if (stable.length > 0 && dev.length > 0) {
    setAllCache(stable, dev);
  }

  return { stable, dev };
}

// Main entry point - unified fetch that populates cache for both types
export const fetchVersions = async (type: 'stable' | 'dev', forceRefresh = false): Promise<VersionInfo[]> => {
  console.log(`[fetchVersions] type=${type}, forceRefresh=${forceRefresh}`);

  // Check cache first
  const cached = getAllCache();

  if (!forceRefresh && cached) {
    const list = type === 'stable' ? cached.stable : cached.dev;
    if (list && list.length > 0) {
      console.log(`[fetchVersions] Using cached ${type} (${list.length} items)`);
      return list;
    }
  }

  // If force refresh or no cache, fetch both lists
  const result = await fetchAllVersions(forceRefresh);
  return type === 'stable' ? result.stable : result.dev;
};

// Fetch stable versions from GitHub Releases API
async function fetchStableVersions(): Promise<VersionInfo[]> {
  console.log('[fetchStableVersions] Fetching releases from GitHub API...');

  try {
    const releasesResponse = await fetch(`${BASE_URL}/releases?per_page=100`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ComfyUI-Launcher'
      }
    });

    if (!releasesResponse.ok) {
      throw new Error(`Releases API ${releasesResponse.status}`);
    }

    const releases = await releasesResponse.json();
    console.log(`[fetchStableVersions] Got ${releases.length} releases`);

    // Also fetch tags for commit SHAs
    const tagsResponse = await fetch(`${BASE_URL}/tags?per_page=100`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ComfyUI-Launcher'
      }
    });

    const tags = tagsResponse.ok ? await tagsResponse.json() : [];
    const tagMap = new Map<string, string>();
    tags.forEach((tag: any) => {
      tagMap.set(tag.name, tag.commit.sha);
    });

    return releases.map((release: any) => {
      const tagName = release.tag_name;
      const commitSha = tagMap.get(tagName) || release.target_commitish;

      return {
        id: commitSha ? commitSha.substring(0, 7) : tagName,
        fullId: commitSha || tagName,
        message: release.name || tagName,
        date: new Date(release.published_at).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        type: 'stable'
      };
    });
  } catch (error) {
    console.error('[fetchStableVersions] Error:', error);
    return [{
      id: 'Error',
      fullId: '',
      message: `Failed to fetch stable versions: ${error instanceof Error ? error.message : 'Unknown'}`,
      date: new Date().toLocaleTimeString(),
      type: 'stable'
    }];
  }
}

// Fetch dev versions from local git log (complete history)
async function fetchDevVersions(): Promise<VersionInfo[]> {
  console.log('[fetchDevVersions] Fetching from local git...');

  if (!window.electronAPI) {
    console.log('[fetchDevVersions] electronAPI not available, using API fallback');
    return fetchDevFromAPI();
  }

  try {
    // Ensure repo has complete history
    const isShallow = await window.electronAPI.gitCommand('rev-parse --is-shallow-repository', emptySettings);
    if (isShallow?.trim() === 'true') {
      console.log('[fetchDevVersions] Unshallowing repo (this may take a moment)...');
      await window.electronAPI.gitCommand('fetch origin --unshallow --tags', emptySettings);
    } else {
      await window.electronAPI.gitCommand('fetch origin --tags', emptySettings);
    }

    // Get ALL commits (no -n limit for complete history)
    console.log('[fetchDevVersions] Running git log for complete history...');
    const logOutput = await window.electronAPI.gitCommand(
      'log origin/master --format="%H|%s|%ci"',
      emptySettings
    );

    if (!logOutput || !logOutput.trim()) {
      console.log('[fetchDevVersions] No output from git log, using API fallback');
      return fetchDevFromAPI();
    }

    const lines = logOutput.trim().split('\n');
    console.log(`[fetchDevVersions] Got ${lines.length} commits`);

    const versions: VersionInfo[] = [];
    for (const line of lines) {
      if (!line.includes('|')) continue;

      const parts = line.split('|');
      const fullId = (parts[0] || '').replace(/"/g, '').trim();
      const message = (parts[1] || '').trim();
      const date = (parts.slice(2).join('|') || '').replace(/"/g, '').trim();

      if (fullId && fullId.length >= 7) {
        versions.push({
          id: fullId.substring(0, 7),
          fullId: fullId,
          message: message,
          date: formatGitDate(date),
          type: 'dev'
        });
      }
    }

    console.log(`[fetchDevVersions] Parsed ${versions.length} versions`);
    return versions;

  } catch (error) {
    console.error('[fetchDevVersions] Error:', error);
    return fetchDevFromAPI();
  }
}

// Fetch dev versions from GitHub API (fallback)
async function fetchDevFromAPI(): Promise<VersionInfo[]> {
  console.log('[fetchDevFromAPI] Fetching commits from GitHub API...');

  try {
    // Fetch multiple pages for more complete history
    const allCommits: any[] = [];
    const pagesToFetch = 5; // 5 pages x 100 = 500 commits

    for (let page = 1; page <= pagesToFetch; page++) {
      const response = await fetch(`${BASE_URL}/commits?per_page=100&page=${page}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ComfyUI-Launcher'
        }
      });

      if (!response.ok) {
        if (page === 1) throw new Error(`Commits API ${response.status}`);
        break;
      }

      const data = await response.json();
      if (data.length === 0) break;

      allCommits.push(...data);

      // Small delay between requests to avoid rate limiting
      if (page < pagesToFetch) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    console.log(`[fetchDevFromAPI] Got ${allCommits.length} commits`);

    return allCommits.map((item: any) => ({
      id: item.sha.substring(0, 7),
      fullId: item.sha,
      message: item.commit.message.split('\n')[0],
      date: new Date(item.commit.author.date).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
      type: 'dev'
    }));
  } catch (error) {
    console.error('[fetchDevFromAPI] Error:', error);
    return [{
      id: 'Error',
      fullId: '',
      message: `Failed to fetch dev versions: ${error instanceof Error ? error.message : 'Unknown'}`,
      date: new Date().toLocaleTimeString(),
      type: 'dev'
    }];
  }
}
