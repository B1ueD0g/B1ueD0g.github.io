#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import yaml


POSTS_ROOT = Path("content/posts")
FM_PATTERN = re.compile(r"^---\n(.*?)\n---\n?", re.S)
DEFAULT_COVER_IMAGE = "/branding/banner-logo.webp"


CATEGORY_BASE_TAGS = {
    "技术好文": ["技术实践"],
    "好文翻译": ["技术译文", "翻译"],
    "国学经典": ["阅读思考", "读书笔记", "国学经典"],
    "科研总结系列": ["科研方法"],
    "待发文章归档": ["草稿"],
}


TOPIC_RULES: List[Tuple[re.Pattern[str], List[str]]] = [
    (re.compile(r"(零信任|zero\s*trust|zta)", re.I), ["零信任"]),
    (re.compile(r"(kubernetes|k8s)", re.I), ["Kubernetes", "云原生安全"]),
    (re.compile(r"(devsecops)", re.I), ["DevSecOps"]),
    (re.compile(r"(\bapi\b|api安全|接口安全)", re.I), ["API安全"]),
    (re.compile(r"(\bai\b|人工智能|大语言|llm|chatgpt|模型)", re.I), ["AI安全"]),
    (re.compile(r"(云安全|云计算|cnapp|sase|云原生)", re.I), ["云安全"]),
    (re.compile(r"(威胁情报|threat\s*intelligence|威胁狩猎|情报驱动|ioc|ttp)", re.I), ["威胁情报"]),
    (re.compile(r"(漏洞|cve|cnvd|渗透|提权|横向移动)", re.I), ["漏洞研究"]),
    (re.compile(r"(数据安全|数据治理|数据保护|分类分级|个人信息|隐私|dpo|compliance|合规)", re.I), ["数据安全"]),
    (re.compile(r"(内网穿透|zerotier|frp|v2ray|fwknop|代理)", re.I), ["网络工具"]),
    (re.compile(r"(勒索|木马|恶意软件)", re.I), ["恶意软件"]),
    (
        re.compile(r"(读后|阅后|摘抄|经典|周易|地坛|长安|太白|国民党党权兴衰)", re.I),
        ["阅读思考"],
    ),
    (re.compile(r"(文献|科研|学术|提示词)", re.I), ["科研方法"]),
    (re.compile(r"(标准|规范|白皮书|报告|框架)", re.I), ["标准解读"]),
    (re.compile(r"(翻译|原文)", re.I), ["翻译"]),
]

METHOD_RULES: List[Tuple[re.Pattern[str], List[str]]] = [
    (re.compile(r"(实战|实践|落地|部署|配置|排查|防护)", re.I), ["实操指南"]),
    (re.compile(r"(解读|解析|剖析|评测|对比)", re.I), ["方法解析"]),
    (re.compile(r"(治理|合规|制度|体系|评估)", re.I), ["治理实践"]),
    (re.compile(r"(读后|阅后|摘抄|随笔)", re.I), ["读后总结"]),
]

TOPIC_TAGS = {
    "零信任",
    "Kubernetes",
    "云原生安全",
    "DevSecOps",
    "API安全",
    "AI安全",
    "云安全",
    "威胁情报",
    "漏洞研究",
    "数据安全",
    "网络工具",
    "恶意软件",
    "阅读思考",
    "标准解读",
}

INVALID_DESCRIPTION_PATTERNS = [
    re.compile(r"^(本文记于|更新于|记录于)"),
    re.compile(r"^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}"),
]


def iter_post_files(root: Path) -> Iterable[Path]:
    for path in sorted(root.rglob("*.md")):
        if path.name == "_index.md":
            continue
        yield path


def strip_markdown(text: str) -> str:
    text = re.sub(r"!\[[^\]]*]\([^)]+\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"`{1,3}([^`]*)`{1,3}", r"\1", text)
    text = re.sub(r"^>+\s*", "", text, flags=re.M)
    text = re.sub(r"[*_~#]", "", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def first_paragraph(body: str) -> str:
    for block in re.split(r"\n\s*\n", body):
        line = strip_markdown(block.strip())
        if not line:
            continue
        if line.startswith(("原文地址", "原文链接", "译者", "原文作者", "本文记于")):
            continue
        if re.fullmatch(r"[0-9:\-年月日点分秒 ]+", line):
            continue
        if any(pattern.search(line) for pattern in INVALID_DESCRIPTION_PATTERNS):
            continue
        if len(line) >= 20 and re.search(r"[\u4e00-\u9fffA-Za-z]", line):
            return line
    return ""


def shorten(text: str, max_len: int = 116) -> str:
    if len(text) <= max_len:
        return text
    clipped = text[: max_len - 3].rstrip(" ，,。.!！？；;：:")
    return clipped + "..."


def ensure_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        v = value.strip()
        return [v] if v else []
    if isinstance(value, list):
        out = []
        for item in value:
            s = str(item).strip()
            if s:
                out.append(s)
        return out
    return []


def dedup(items: Iterable[str]) -> List[str]:
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def normalize_date(value: Any) -> Any:
    if isinstance(value, dt.datetime):
        return value.isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    return value


def is_valid_description(text: str, min_len: int = 28) -> bool:
    clean = strip_markdown(text).strip()
    if len(clean) < min_len:
        return False
    if clean.startswith(("原文地址", "原文链接", "译者", "原文作者", "本文记于")):
        return False
    if re.fullmatch(r"[0-9:\-年月日点分秒 ]+", clean):
        return False
    return not any(pattern.search(clean) for pattern in INVALID_DESCRIPTION_PATTERNS)


def build_tags(path: Path, data: Dict[str, Any], body: str) -> List[str]:
    categories = ensure_list(data.get("categories"))
    title = str(data.get("title", ""))
    summary = str(data.get("summary", ""))
    description = str(data.get("description", ""))
    leading_paragraph = first_paragraph(body)
    search_text = f"{path.as_posix()} {title} {summary} {description} {leading_paragraph}"

    tags: List[str] = []
    for cat in categories:
        tags.extend(CATEGORY_BASE_TAGS.get(cat, []))
        if "零信任" in cat:
            tags.append("零信任")

    for pattern, mapped_tags in TOPIC_RULES:
        if pattern.search(search_text):
            tags.extend(mapped_tags)

    for pattern, mapped_tags in METHOD_RULES:
        if pattern.search(search_text):
            tags.extend(mapped_tags)

    if "零信任" in path.as_posix():
        tags.append("零信任")

    tags = dedup(tags)

    if "技术实践" in tags and not any(tag in TOPIC_TAGS for tag in tags):
        tags.append("网络安全")

    if not tags:
        tags = ["技术实践", "网络安全"]

    return tags[:6]


def build_description(data: Dict[str, Any], body: str) -> str:
    raw_description = str(data.get("description", "") or "").strip()
    clean_raw_desc = strip_markdown(raw_description)
    if is_valid_description(clean_raw_desc):
        return shorten(clean_raw_desc)

    summary = str(data.get("summary", "") or "").strip()
    clean_summary = strip_markdown(summary)
    if is_valid_description(clean_summary):
        return shorten(clean_summary)

    paragraph = first_paragraph(body)
    if is_valid_description(paragraph, min_len=22):
        return shorten(paragraph)

    return shorten(str(data.get("title", "")).strip())


def build_keywords(tags: List[str], categories: List[str]) -> List[str]:
    raw = []
    raw.extend(tags[:6])
    raw.extend(categories[:2])
    raw.append("BlueDog")
    return dedup([item for item in raw if item])[:8]


def build_cover(front: Dict[str, Any], title: str) -> Dict[str, Any]:
    incoming = front.get("cover")
    cover = incoming if isinstance(incoming, dict) else {}

    image = str(cover.get("image", "") or "").strip() or DEFAULT_COVER_IMAGE
    alt = str(cover.get("alt", "") or "").strip() or f"{title} - BlueDog"
    caption = str(cover.get("caption", "") or "").strip()

    normalized_cover: Dict[str, Any] = {
        "image": image,
        "alt": alt,
        "caption": caption,
        "relative": bool(cover.get("relative", False)),
        "hidden": bool(cover.get("hidden", True)),
        "hiddenInList": bool(cover.get("hiddenInList", True)),
        "hiddenInSingle": bool(cover.get("hiddenInSingle", True)),
    }
    return normalized_cover


def load_front_matter(text: str) -> Tuple[Dict[str, Any], str]:
    match = FM_PATTERN.match(text)
    if not match:
        return {}, text
    front = yaml.safe_load(match.group(1)) or {}
    body = text[match.end() :]
    return front, body


def dump_front_matter(data: Dict[str, Any], body: str) -> str:
    dumped = yaml.safe_dump(
        data,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
        width=999,
    ).strip()
    return f"---\n{dumped}\n---\n{body.lstrip()}"


def normalize_front_matter(path: Path, front: Dict[str, Any], body: str) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {}

    title = str(front.get("title", "")).strip()
    date_value = normalize_date(front.get("date"))
    draft = bool(front.get("draft", False))

    categories = ensure_list(front.get("categories"))
    if not categories:
        categories = ["技术好文"]

    tags = build_tags(path, front, body)
    description = build_description(front, body)
    summary = str(front.get("summary", "") or "").strip()
    if not is_valid_description(summary, min_len=20):
        summary = description
    keywords = build_keywords(tags, categories)
    cover = build_cover(front, title)

    normalized["title"] = title
    normalized["date"] = date_value
    normalized["draft"] = draft
    normalized["description"] = description
    if summary:
        normalized["summary"] = shorten(strip_markdown(summary))
    normalized["categories"] = categories
    normalized["tags"] = tags
    normalized["keywords"] = keywords
    normalized["cover"] = cover

    for key, value in front.items():
        if key not in normalized:
            normalized[key] = value

    return normalized


def process_file(path: Path, apply: bool) -> Tuple[bool, str]:
    text = path.read_text(encoding="utf-8")
    front, body = load_front_matter(text)
    if not front:
        return False, f"skip(no-frontmatter): {path.as_posix()}"

    normalized = normalize_front_matter(path, front, body)
    updated = dump_front_matter(normalized, body)
    changed = updated != text
    if changed and apply:
        path.write_text(updated, encoding="utf-8")
    status = "updated" if changed else "ok"
    return changed, f"{status}: {path.as_posix()}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize post metadata for SEO and tag taxonomy.")
    parser.add_argument("--apply", action="store_true", help="Write changes to files.")
    args = parser.parse_args()

    files = list(iter_post_files(POSTS_ROOT))
    changed_count = 0

    for path in files:
        changed, line = process_file(path, apply=args.apply)
        if changed:
            changed_count += 1
        print(line)

    print(f"\nTotal posts: {len(files)}")
    print(f"Changed: {changed_count}")
    print(f"Mode: {'apply' if args.apply else 'dry-run'}")


if __name__ == "__main__":
    main()
