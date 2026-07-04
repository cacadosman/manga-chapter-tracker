import { escapeCdata, malDate } from './util.js';

export function buildMalXml(state) {
  const settings = state.settings || {};
  const list = Object.values(state.manga || {}).sort((a, b) =>
    (a.title || '').localeCompare(b.title || '')
  );
  const t = (s) => '\t' + s;
  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8" ?>');
  L.push('');
  L.push('\t<!--');
  L.push('\t Created by Manga Chapter Tracker');
  L.push('\t Compatible with MyAnimeList manga list XML import (schema 1.1.0)');
  L.push('\t-->');
  L.push('');
  L.push('\t<myanimelist>');
  L.push('');

  const total = list.length;
  L.push(t('\t<myinfo>'));
  L.push(t('\t\t<user_id>0</user_id>'));
  L.push(t('\t\t<user_name><![CDATA[' + escapeCdata(settings.malUserName || '') + ']]></user_name>'));
  L.push(t('\t\t<user_export_type>2</user_export_type>'));
  L.push(t('\t\t<user_total_manga>' + total + '</user_total_manga>'));
  L.push(t('\t\t<user_total_reading>' + total + '</user_total_reading>'));
  L.push(t('\t\t<user_total_completed>0</user_total_completed>'));
  L.push(t('\t\t<user_total_onhold>0</user_total_onhold>'));
  L.push(t('\t\t<user_total_dropped>0</user_total_dropped>'));
  L.push(t('\t\t<user_total_plantoread>0</user_total_plantoread>'));
  L.push(t('\t</myinfo>'));
  L.push('');

  for (const m of list) {
    const readChapters = Math.floor(Number(m.maxChapter) || 0);
    L.push(t('\t\t\t<manga>'));
    L.push(t('\t\t\t\t<manga_mangadb_id>' + (m.malId || 0) + '</manga_mangadb_id>'));
    L.push(t('\t\t\t\t<manga_title><![CDATA[' + escapeCdata(m.title || 'Unknown') + ']]></manga_title>'));
    L.push(t('\t\t\t\t<manga_volumes>0</manga_volumes>'));
    L.push(t('\t\t\t\t<manga_chapters>0</manga_chapters>'));
    L.push(t('\t\t\t\t<my_id>0</my_id>'));
    L.push(t('\t\t\t\t<my_read_volumes>0</my_read_volumes>'));
    L.push(t('\t\t\t\t<my_read_chapters>' + readChapters + '</my_read_chapters>'));
    L.push(t('\t\t\t\t<my_start_date>' + malDate(m.firstReadAt) + '</my_start_date>'));
    L.push(t('\t\t\t\t<my_finish_date>0000-00-00</my_finish_date>'));
    L.push(t('\t\t\t\t<my_scanalation_group><![CDATA[]]></my_scanalation_group>'));
    L.push(t('\t\t\t\t<my_score>0</my_score>'));
    L.push(t('\t\t\t\t<my_storage></my_storage>'));
    L.push(t('\t\t\t\t<my_retail_volumes>0</my_retail_volumes>'));
    L.push(t('\t\t\t\t<my_status>Reading</my_status>'));
    L.push(t('\t\t\t\t<my_comments><![CDATA[]]></my_comments>'));
    L.push(t('\t\t\t\t<my_times_read>0</my_times_read>'));
    L.push(t('\t\t\t\t<my_tags><![CDATA[]]></my_tags>'));
    L.push(t('\t\t\t\t<my_priority>Low</my_priority>'));
    L.push(t('\t\t\t\t<my_reread_value></my_reread_value>'));
    L.push(t('\t\t\t\t<my_rereading>NO</my_rereading>'));
    L.push(t('\t\t\t\t<my_discuss>YES</my_discuss>'));
    L.push(t('\t\t\t\t<my_sns>default</my_sns>'));
    L.push(t('\t\t\t\t<update_on_import>1</update_on_import>'));
    L.push(t('\t\t\t</manga>'));
    L.push('');
  }

  L.push('\t</myanimelist>');
  L.push('');
  return L.join('\n');
}
