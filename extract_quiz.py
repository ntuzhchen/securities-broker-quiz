#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_quiz.py - 從 HyRead App 解密並精準萃取《證券商業務員》全書題庫
"""

import os
import re
import json

HYREAD_DATA_PATH = "/Users/circlechen/Library/Containers/18A34096-B343-40CE-87DF-E6EE64B53E86/Data/Library/Application Support/moccount/tpml/aaf4acf3401ee442bb8ac88b6fe7983d7a1fbd4d065ab559a0f1cd5329136342/407908-0/HYWEB/index/ebook407762/data.enc/words#001.dat"
OUTPUT_PATH = "/Users/circlechen/.gemini/antigravity/scratch/securities-broker-quiz/questions.json"

CHOICE_MAP = {
    'A': 1, 'B': 2, 'C': 3, 'D': 4,
    'a': 1, 'b': 2, 'c': 3, 'd': 4,
    '＃': 1, '#': 1
}

# 根據全書目錄精密劃分頁碼範圍
CHAPTER_DEFINITIONS = [
    # 第一篇 證券交易相關法規
    ("法規篇", "證券交易相關法規", "Chapter 01 公司法", 12, 50),
    ("法規篇", "證券交易相關法規", "Chapter 02 證券交易法及相關法規", 50, 113),
    ("法規篇", "證券交易相關法規", "Chapter 03 證券投資信託及顧問法", 113, 149),
    # 第二篇 證券交易實務
    ("實務篇", "證券交易實務", "Chapter 01 開戶、受託買賣相關規定", 149, 160),
    ("實務篇", "證券交易實務", "Chapter 02 特殊交易制度", 160, 173),
    ("實務篇", "證券交易實務", "Chapter 03 信用交易制度", 173, 179),
    ("實務篇", "證券交易實務", "Chapter 04 集中保管與承銷制度", 179, 221),
    # 第三篇 證券投資
    ("投資篇", "證券投資", "Chapter 01 金融市場簡述", 221, 239),
    ("投資篇", "證券投資", "Chapter 02 債券投資", 239, 249),
    ("投資篇", "證券投資", "Chapter 03 股票投資分析", 249, 270),
    ("投資篇", "證券投資", "Chapter 04 衍生性金融商品", 270, 278),
    ("投資篇", "證券投資", "Chapter 05 投資組合與資本資產定價", 278, 317),
    # 第四篇 財務分析
    ("財析篇", "財務分析", "Chapter 01 財務報表分析的工具", 317, 321),
    ("財析篇", "財務分析", "Chapter 02 各項比率分析介紹", 321, 393),
    # 第五篇 歷屆試題與解析
    ("歷屆試題", "歷屆試題與解析", "111年 第3次證券商業務員資格測驗", 393, 413),
    ("歷屆試題", "歷屆試題與解析", "112年 第1次證券商業務員資格測驗", 413, 433),
    ("歷屆試題", "歷屆試題與解析", "112年 第2次證券商業務員資格測驗", 433, 453),
    ("歷屆試題", "歷屆試題與解析", "112年 第3次證券商業務員資格測驗", 453, 474),
    ("歷屆試題", "歷屆試題與解析", "113年 第1次證券商業務員資格測驗", 474, 496),
    ("歷屆試題", "歷屆試題與解析", "113年 第2次證券商業務員資格測驗", 496, 525),
]

def clean_page(p):
    """去除頁眉與頁碼以利段落與文字無縫連接，同時保留區塊分隔關鍵字"""
    p = re.sub(r'(解答與解析|牛刀小試|精選範題)', r'\n\1\n', p)
    p = re.sub(r'^\s*\d{1,3}\s+(?:第[一二三四五]篇\s*[^\n\d]+|Chapter\s*\d+\s*[^\n\d]+|[^\n\d]{2,20})\s*\n?', '', p)
    p = re.sub(r'^\s*(?:11[0-9]年\s*第\d+次[^\n\d]+|Chapter\s*\d+\s*[^\n\d]+|第[一二三四五]篇\s*[^\n\d]+)\s+\d{1,3}\s*\n?', '', p)
    return p

def parse_question_chunk(chunk):
    """精準依序匹配 (A), (B), (C), (D) 四個選項，避免選項內文字干擾"""
    m_a = re.search(r'[(（]\s*[Aa]\s*[)）]', chunk)
    if not m_a:
        return None
    m_b = re.search(r'[(（]\s*[Bb]\s*[)）]', chunk[m_a.end():])
    if not m_b:
        return None
    pos_b = m_a.end() + m_b.start()
    end_b = m_a.end() + m_b.end()
    
    m_c = re.search(r'[(（]\s*[Cc]\s*[)）]', chunk[end_b:])
    if not m_c:
        return None
    pos_c = end_b + m_c.start()
    end_c = end_b + m_c.end()
    
    m_d = re.search(r'[(（]\s*[Dd]\s*[)）]', chunk[end_c:])
    if not m_d:
        return None
    pos_d = end_c + m_d.start()
    end_d = end_c + m_d.end()
    
    q_text = chunk[:m_a.start()].strip()
    q_text = re.sub(r'^\s*\d{1,3}\s+', '', q_text).strip()
    q_text = re.sub(r'^(?:牛刀小試|精選範題|重點\s*\d+[^\n]*)\s*', '', q_text).strip()
    q_text = re.sub(r'\s+', ' ', q_text)
    
    opts = []
    for opt in [chunk[m_a.end():pos_b], chunk[end_b:pos_c], chunk[end_c:pos_d], chunk[end_d:]]:
        opt = re.sub(r'\s+', ' ', opt)
        opt = re.sub(r'【\s*1\d\d年[^\n】]*】', '', opt)
        opt = re.sub(r'[。；;]$', '', opt).strip()
        opts.append(opt)
        
    num_m = re.match(r'^\s*(\d{1,3})', chunk)
    q_num = int(num_m.group(1)) if num_m else 0
    return q_num, q_text, opts

def extract_qa_from_text(block_text):
    """
    從一段文字中切分出題目集合與解答集合並配對
    """
    segments = re.split(r'解答與解析(?:[ 　]*答案標示為[＃#]者[^\n]*|\s*)', block_text)
    qa_pairs = []
    
    for s_idx in range(len(segments) - 1):
        q_segment = segments[s_idx]
        ans_segment = segments[s_idx + 1]
        
        # 1. 題目萃取
        raw_chunks = re.split(r'\(\s*\)', q_segment)
        parsed_questions = []
        for chunk in raw_chunks[1:]:
            res = parse_question_chunk(chunk)
            if res:
                num, q_text, opts = res
                if len(opts) == 4 and all(len(o) > 0 for o in opts) and len(q_text) > 2:
                    parsed_questions.append({
                        'num': num if num > 0 else len(parsed_questions) + 1,
                        'question': q_text,
                        'options': opts
                    })

        # 2. 答案萃取
        matches = list(re.finditer(r'(?:^|[^\d])(?:(\d{1,3})\s*)?[(（]([A-D#＃a-d])[)）][。.\s]', ans_segment))
        parsed_answers = {}
        for ans_idx, m in enumerate(matches):
            a_num_str = m.group(1)
            choice = m.group(2).strip().upper()
            a_num = int(a_num_str) if a_num_str else ans_idx + 1
            
            start_pos = m.end()
            end_pos = matches[ans_idx + 1].start() if ans_idx + 1 < len(matches) else len(ans_segment)
            chunk = ans_segment[start_pos:end_pos]
            
            cut = re.search(r'(?:Chapter\s*\d+|重點\s*\d+|牛刀小試|精選範題|\(\s*\))', chunk)
            if cut:
                chunk = chunk[:cut.start()]
                
            exp_clean = re.sub(r'\s+', ' ', chunk).strip()
            parsed_answers[a_num] = {
                'choice': choice,
                'explanation': exp_clean
            }
            parsed_answers[ans_idx + 1] = {
                'choice': choice,
                'explanation': exp_clean
            }
            
        # 3. 配對
        for q_idx, q in enumerate(parsed_questions):
            q_num = q['num']
            ans_info = parsed_answers.get(q_num) or parsed_answers.get(q_idx + 1)
            
            answer_val = 1
            explanation_val = "請參照公司法、證交法等主管機關最新金融法規與官方公告準則。"
            if ans_info:
                choice = ans_info['choice']
                answer_val = CHOICE_MAP.get(choice, 1)
                if ans_info['explanation']:
                    explanation_val = ans_info['explanation']
                else:
                    explanation_val = f"正確答案為選項 ({choice})。"
                    
            qa_pairs.append({
                'question': q['question'],
                'options': q['options'],
                'answer': answer_val,
                'explanation': explanation_val
            })
                
    return qa_pairs

def run_extraction():
    if not os.path.exists(HYREAD_DATA_PATH):
        raise FileNotFoundError(f"HyRead file not found: {HYREAD_DATA_PATH}")

    with open(HYREAD_DATA_PATH, 'rb') as f:
        raw = f.read()

    text = bytes([b ^ 0x80 for b in raw]).decode('utf-8', errors='replace')
    pages = [clean_page(p) for p in text.split('\x0c')]
    print(f"Total book pages: {len(pages)}")

    all_questions = []
    global_id = 1

    for level, subject, chapter, start_p, end_p in CHAPTER_DEFINITIONS:
        end_p = min(end_p, len(pages))
        ch_text = "\n".join(pages[start_p:end_p])
        
        pairs = extract_qa_from_text(ch_text)
        print(f"[{level}] {chapter}: Extracted {len(pairs)} questions")
        
        for p in pairs:
            # 判斷 source
            src = "牛刀小試"
            if "歷屆" in subject or "資格測驗" in chapter:
                src = chapter.split()[0] + " " + chapter.split()[1] if len(chapter.split()) > 1 else chapter
            elif "精選範題" in p['explanation'] or len(pairs) > 30:
                src = "章節精選範題"
                
            all_questions.append({
                "id": global_id,
                "level": level,
                "subject": subject,
                "chapter": chapter,
                "source": src,
                "question": p['question'],
                "options": p['options'],
                "answer": p['answer'],
                "explanation": p['explanation']
            })
            global_id += 1

    print(f"\n==========================================")
    print(f"Total extracted questions: {len(all_questions)}")
    print(f"==========================================")

    # 儲存到 questions.json
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)
    print(f"Saved to {OUTPUT_PATH}")

    # 分類題數統計
    level_counts = {}
    for q in all_questions:
        level_counts[q['level']] = level_counts.get(q['level'], 0) + 1
    for lvl, cnt in level_counts.items():
        print(f"  * {lvl}: {cnt} 題")

if __name__ == '__main__':
    run_extraction()
