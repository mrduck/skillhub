#!/usr/bin/env python3
"""
SkillHub 数据更新脚本
1. 从 awesome-agent-skills README 解析最新 skills
2. 验证 GitHub 仓库是否存在（排除 404）
3. 拉取 GitHub star 数
4. 更新 skillhub/data/skills.json

用法:
  python3 update_skills.py          # 完整更新
  python3 update_skills.py --stars-only  # 仅更新 star 数
"""

import json
import re
import subprocess
import sys
import time
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict, OrderedDict

# === 配置 ===
SKILLS_PATH = "skillhub/data/skills.json"
README_URL = "https://raw.githubusercontent.com/Chihchingho/awesome-agent-skills/main/README.md"
TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_API = "https://api.github.com"
CONCURRENCY = 8 if TOKEN else 2

# 已知的官方 skills 仓库（用于 rawUrl 推导和非 GitHub 源的 star 补充）
VERIFIED_REPOS = {
    "anthropics/skills": 4300,
    "voltagent/skills": 60,
}

# === 工具函数 ===

def curl_get(url, api=False):
    """HTTP GET 请求"""
    cmd = ["curl", "-s", "-L", "--connect-timeout", "10", "--max-time", "15", url]
    if api and TOKEN:
        cmd += ["-H", f"Authorization: Bearer {TOKEN}"]
    if api:
        cmd += ["-H", "Accept: application/vnd.github.v3+json"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        return result.stdout
    except Exception:
        return ""

def extract_github_repo(source_url):
    """从 sourceUrl 提取 GitHub owner/repo"""
    if not source_url:
        return None
    m = re.search(r'github\.com/([^/]+/[^/]+?)(?:\.git)?(?:/|$)', source_url)
    if not m:
        return None
    owner_repo = m.group(1)
    owner_repo = re.sub(r'/(tree|blob)/.*$', '', owner_repo)
    return owner_repo.lower()

def is_verified_repo(owner, repo):
    """检查是否在验证过的仓库列表中"""
    key = f"{owner}/{repo}".lower()
    for vk in VERIFIED_REPOS:
        if vk.lower() == key:
            return True
    return False

def derive_raw_url(source_url):
    """为已验证仓库推导 raw.githubusercontent.com 链接"""
    if not source_url:
        return ""
    m = re.search(r'github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/tree/([^/]+)/(.+))?$', source_url)
    if not m:
        return ""
    owner, repo = m.group(1), m.group(2)
    branch = m.group(3) or "main"
    path = m.group(4) or ""
    if not is_verified_repo(owner, repo):
        return ""
    if path and path.endswith("/SKILL.md"):
        return f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
    return ""

def generate_skill_id(name):
    """生成 skill ID：小写 + 特殊字符替换为连字符"""
    clean = re.sub(r'[^a-z0-9]+', '-', name.lower())
    return clean.strip('-')

def check_repo_exists(owner_repo):
    """检查 GitHub 仓库是否存在"""
    url = f"{GITHUB_API}/repos/{owner_repo}"
    resp = curl_get(url, api=True)
    if not resp:
        return False
    try:
        data = json.loads(resp)
        return "stargazers_count" in data
    except json.JSONDecodeError:
        return False

def fetch_stars(owner_repo):
    """获取单个仓库的 star 数"""
    url = f"{GITHUB_API}/repos/{owner_repo}"
    resp = curl_get(url, api=True)
    if not resp:
        return owner_repo, 0
    try:
        data = json.loads(resp)
        if "stargazers_count" in data:
            return owner_repo, data["stargazers_count"]
        elif data.get("message") == "Not Found":
            print(f"  [404] {owner_repo}")
            return owner_repo, 0
        elif "rate limit" in data.get("message", "").lower():
            print(f"  [RATE LIMITED] {owner_repo}")
            return owner_repo, None  # 需重试
        else:
            print(f"  [ERROR] {owner_repo}: {data.get('message', '')}")
            return owner_repo, 0
    except Exception as e:
        print(f"  [EXCEPTION] {owner_repo}: {e}")
        return owner_repo, 0

# === 步骤 1: 解析 README ===

def parse_readme(readme_text):
    """从 README 解析所有 skills"""
    skills = []
    in_skills_section = False
    current_category = ""
    current_author = ""
    current_repo_url = ""

    lines = readme_text.split('\n')

    for line in lines:
        # 检测 "Community Skills" 章节开始
        if re.match(r'^##\s+Community Skills', line, re.IGNORECASE):
            in_skills_section = True
            continue

        # 检测下一个 ## 章节，停止解析
        if in_skills_section and re.match(r'^##\s+', line):
            break

        if not in_skills_section:
            continue

        # 检测子分类 (### xxx)
        m_cat = re.match(r'^###\s+(.+)', line)
        if m_cat:
            current_category = m_cat.group(1).strip()
            continue

        # 检测仓库描述 (**[owner/repo](url)**)
        m_repo = re.match(r'^\s*-\s*\*\*\[([^\]]+)\]\(([^)]+)\)\*\*\s*(?:[-–—]\s*(.+))?$', line)
        if m_repo:
            full_name_text = m_repo.group(1)  # e.g., "anthropics/skills"
            repo_url = m_repo.group(2)
            desc = (m_repo.group(3) or "").strip()

            parts = full_name_text.split('/')
            if len(parts) >= 2:
                current_author = parts[0]
            current_repo_url = repo_url
            continue

        # 检测 skill 条目 (- **skill-name** - description)
        m_skill = re.match(r'^\s*-\s*\*\*([^:]+?)\*\*\s*(?:[-–—]\s*(.+))?$', line)
        if m_skill:
            name = m_skill.group(1).strip()
            desc = (m_skill.group(2) or "").strip()

            # 跳过非 skill 的条目
            if any(kw in name.lower() for kw in ['###', '## ', 'repository', 'total skills', 'star this repo', 'contributing']):
                continue

            skill_id = generate_skill_id(name)

            # 构建 sourceUrl
            if current_repo_url:
                # 检查是否是 GitHub URL
                if 'github.com' in current_repo_url:
                    source_url = current_repo_url
                    # 如果有 skill 路径，添加到 URL
                    if '/' in current_repo_url:
                        parts_url = current_repo_url.rstrip('/').split('/')
                        source_url = current_repo_url.rstrip('/')
                else:
                    source_url = current_repo_url
            else:
                source_url = ""

            # 检查是否是官方 skills（通过 officialskills.sh）
            repo_key = f"{current_author.lower()}/{current_repo_url.split('/')[-1].lower()}" if current_repo_url else ""
            is_official = is_verified_repo(current_author.lower(), current_repo_url.split('/')[-1].lower() if '/' in current_repo_url else "")

            # 对于官方 skill，sourceUrl 使用 officialskills.sh 格式
            if current_author.lower() == "anthropics":
                source_url = f"https://officialskills.sh/anthropics/skills/{skill_id}"
            elif current_author.lower() == "voltagent":
                source_url = f"https://officialskills.sh/voltagent/skills/{skill_id}"

            skill = {
                "id": skill_id,
                "name": name,
                "description": desc or name,
                "author": current_author,
                "installs": 0,
                "stars": 0,
                "category": current_category or "Community Skills",
                "tags": [],
                "platforms": ["claude-code"],
                "installCommand": f"npx skills add {skill_id}",
                "content": "",
                "sourceUrl": source_url,
                "rawUrl": derive_raw_url(source_url),
                "updatedAt": "2026-06-01",
                "createdAt": "2025-01-01",
                "isFavorited": False
            }
            skills.append(skill)

    return skills

# === 步骤 2: 验证仓库 ===

def verify_repos(skills):
    """检查所有 GitHub sourceUrl 对应仓库是否存在，移除 404 的"""
    # 提取唯一仓库
    repos = set()
    for s in skills:
        repo = extract_github_repo(s.get("sourceUrl", ""))
        if repo:
            repos.add(repo)

    print(f"\n🔍 验证 {len(repos)} 个唯一 GitHub 仓库...")
    dead_repos = set()

    # 并发检查
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = {executor.submit(check_repo_exists, r): r for r in repos}
        done = 0
        for future in as_completed(futures):
            repo = futures[future]
            exists = future.result()
            if not exists:
                dead_repos.add(repo)
                print(f"  [DEAD] {repo}")
            done += 1
            if done % 30 == 0:
                print(f"  进度: {done}/{len(repos)}")

    if dead_repos:
        # 移除 dead repo 的 skills
        before = len(skills)
        skills = [s for s in skills if extract_github_repo(s.get("sourceUrl", "")) not in dead_repos]
        print(f"  移除了 {before - len(skills)} 个 skill（来自 {len(dead_repos)} 个失效仓库）")

    return skills

# === 步骤 3: 拉取 Stars ===

def fetch_all_stars(skills):
    """拉取所有唯一 GitHub 仓库的 star 数"""
    # 提取唯一仓库
    repo_map = defaultdict(list)
    for i, s in enumerate(skills):
        repo = extract_github_repo(s.get("sourceUrl", ""))
        if repo:
            repo_map[repo].append(i)

    repos = list(repo_map.keys())
    print(f"\n⭐ 拉取 {len(repos)} 个仓库的 star 数...")

    repo_stars = {}
    failed = []

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = {executor.submit(fetch_stars, r): r for r in repos}
        done = 0
        for future in as_completed(futures):
            owner_repo, stars = future.result()
            if stars is not None:
                repo_stars[owner_repo] = stars
            else:
                failed.append(owner_repo)
            done += 1
            if done % 50 == 0:
                print(f"  进度: {done}/{len(repos)}")

    # 重试失败的
    if failed:
        print(f"\n🔄 重试 {len(failed)} 个被限流的仓库 (等待 65 秒)...")
        time.sleep(65)
        for repo in failed:
            _, stars = fetch_stars(repo)
            repo_stars[repo] = stars if stars is not None else 0

    # 合并已知 stars
    for known_repo, known_stars in VERIFIED_REPOS.items():
        if known_repo not in repo_stars:
            repo_stars[known_repo] = known_stars

    # 更新 skills
    for i, s in enumerate(skills):
        repo = extract_github_repo(s.get("sourceUrl", ""))
        if repo and repo in repo_stars:
            s["stars"] = repo_stars[repo]
        else:
            # 检查是否是已知仓库
            author = s.get("author", "").lower()
            for known_repo, known_stars in VERIFIED_REPOS.items():
                known_owner = known_repo.split("/")[0]
                if author == known_owner:
                    s["stars"] = known_stars
                    break

    return skills, repo_stars

# === 主流程 ===

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "full"

    # 读取现有数据
    print("📖 读取 skills.json ...")
    with open(SKILLS_PATH, "r", encoding="utf-8") as f:
        existing_skills = json.load(f)
    print(f"   当前 {len(existing_skills)} 个 skill")

    if mode == "--stars-only":
        # 仅更新 star 数
        print("\n⭐ 仅更新 star 数...")
        updated_skills, repo_stars = fetch_all_stars(existing_skills)
        final_skills = updated_skills
    else:
        # 完整更新：解析 README + 验证 + stars
        print(f"\n📥 下载 README: {README_URL}")
        readme = curl_get(README_URL)
        if not readme:
            print("❌ 无法下载 README，仅更新 star 数")
            updated_skills, repo_stars = fetch_all_stars(existing_skills)
            final_skills = updated_skills
        else:
            print(f"   README 大小: {len(readme)} 字符")

            # 解析
            print("\n📝 解析 skills...")
            parsed_skills = parse_readme(readme)
            print(f"   解析到 {len(parsed_skills)} 个 skill")

            if len(parsed_skills) < 100:
                print(f"⚠️ 解析结果过少 ({len(parsed_skills)}), 保留现有数据 + 仅更新 stars")
                updated_skills, repo_stars = fetch_all_stars(existing_skills)
                final_skills = updated_skills
            else:
                # 保留现有 skill 的 isFavorited 和 installs 状态
                existing_map = {s["id"]: s for s in existing_skills}
                for s in parsed_skills:
                    if s["id"] in existing_map:
                        s["isFavorited"] = existing_map[s["id"]].get("isFavorited", False)
                        # 保留一些现有标签/平台数据
                        if existing_map[s["id"]].get("tags"):
                            s["tags"] = existing_map[s["id"]]["tags"]
                        if existing_map[s["id"]].get("platforms"):
                            s["platforms"] = existing_map[s["id"]]["platforms"]

                # 验证仓库
                parsed_skills = verify_repos(parsed_skills)

                # 拉取 stars
                final_skills, repo_stars = fetch_all_stars(parsed_skills)

    # 统计
    star_dist = defaultdict(int)
    for s in final_skills:
        stars = s.get("stars", 0)
        if stars >= 50000:
            star_dist["50k+"] += 1
        elif stars >= 10000:
            star_dist["10k-50k"] += 1
        elif stars >= 5000:
            star_dist["5k-10k"] += 1
        elif stars >= 1000:
            star_dist["1k-5k"] += 1
        elif stars >= 100:
            star_dist["100-1k"] += 1
        else:
            star_dist["0-100"] += 1

    print(f"\n📈 最终: {len(final_skills)} 个 skill")
    print("📊 Star 分布:")
    for bucket in ["50k+", "10k-50k", "5k-10k", "1k-5k", "100-1k", "0-100"]:
        if bucket in star_dist:
            print(f"   {bucket}: {star_dist[bucket]} 个")

    # Top 5
    print("\n🏆 Top 5:")
    for s in sorted(final_skills, key=lambda x: x.get("stars", 0), reverse=True)[:5]:
        print(f"   ⭐ {s['stars']:,}  {s['name']} ({s.get('author', '?')})")

    # 写回
    print(f"\n💾 写回 skills.json ...")
    with open(SKILLS_PATH, "w", encoding="utf-8") as f:
        json.dump(final_skills, f, ensure_ascii=False, separators=(",", ":"))

    # 检查变化
    delta = len(final_skills) - len(existing_skills)
    if delta > 0:
        print(f"   +{delta} 个新 skill")
    elif delta < 0:
        print(f"   {delta} 个 skill 被移除")
    else:
        print(f"   数量未变")

    print("\n✅ 完成!")

if __name__ == "__main__":
    main()