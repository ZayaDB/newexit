-- Кино: drama / movie section. Videos stay on YouTube and play in the official
-- embedded player (free; YouTube's terms forbid charging to watch embedded videos).
create table if not exists public.movies (
  id               uuid primary key default gen_random_uuid(),
  youtube_id       text not null unique check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  title            varchar(300) not null,
  channel          text,
  duration_seconds integer,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists movies_active_idx on public.movies (is_active, sort_order, created_at desc);

drop trigger if exists movies_updated_at on public.movies;
create trigger movies_updated_at before update on public.movies
  for each row execute function public.set_updated_at();

alter table public.movies enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'newexit_api') then
    grant select, insert, update, delete on public.movies to newexit_api;
    if not exists (select 1 from pg_policies where tablename = 'movies' and policyname = 'backend_all') then
      create policy backend_all on public.movies for all to newexit_api using (true) with check (true);
    end if;
  end if;
end $$;

-- The client's YouTube playlist "Chinese Ai Drama" (embeddable videos only).
insert into public.movies (youtube_id, title, channel, duration_seconds, sort_order) values
  ('Y3bx0xPUVYo', 'Sword God husband killed her! Reborn she rejected ex, but her first love also proposed!🦊❤', 'CubeTV - Drama Shorts', 9370, 0),
  ('ObTlIBy5lUA', '【Multi Sub】The Fake Heiress Stole My Life… Until I Exposed Her in the Apocalypse！', 'StardustTV - Movies & Dramas', 6913, 1),
  ('Vt-KlsYL4PA', 'I woke up to find myself the mother of three baby dragons', 'MiniSeries Lover', 7250, 2),
  ('a3YlhFeU3wI', '【Multi Sub】They Stole Her Golden Core and Left Her for Dead… She Came Back Stronger Than Ever！', 'StardustTV - Movies & Dramas', 7834, 3),
  ('lmUJProtAmU', '新劇搶先看【此生不繫相思念】她臨死才發現丈夫竟是女兒身，滿心歡喜嫁入的簡府卻成了埋葬她的墳墓！重來一世，她裝成綠茶的樣子親手摘下「丈夫」的偽裝：換你下地獄了！', '心動劇時刻Daily', 5621, 4),
  ('0HiaX8FG00k', '【Multi Sub】Her Brothers Killed Her. Reborn, She Made Them Beg', 'Water drama', 7801, 5),
  ('Kz8BLaklPYI', 'Princess''s Revenge: Taming the Sadistic Emperor into a Masochist!', 'Verse Drama', 7370, 6),
  ('QJ96pPiM-3M', 'Reborn, she cancels wedding with crown prince. Protected by a stronger man, he regrets deeply', '花火劇場', 4269, 7),
  ('0MNNdrwz_Tk', 'Betrayed 25 years in the ancient world, She Returned—he Crossed Time to beg for Her Back!', '聼風吟劇場', 6649, 8),
  ('ylI2nSiG920', 'He chose her sister, then demanded to marry her. She walked away, and he lost everything', '花火劇場', 3097, 9),
  ('zCOTXrqzUMw', 'Cinderella exacted a fierce revenge on the prince who murdered her sister, everyone was shocked!', '高甜短劇社 Sweet', 4820, 10),
  ('0t7FG1lbmaE', '💔【AI】He ruined her life, so she married his brother!', '心跳漫劇社', 3438, 11),
  ('zRBoMdxlh7M', 'Nursed prince 2 years, he married her sister by mistake. She married a scholar. He regretted', '森泉劇場', 3260, 12),
  ('GgkULRUqRJE', 'My Fiancé, Brother and Best Friend All Chose Her—So I Married a Stranger', '歲歲觉醒剧场ShortTV', 2314, 13),
  ('56qWQvtyyGE', 'Reborn, Sister rushed to marry my jerk husband from past life, I married cold prince, was spoiled!', 'Sarah Sweet Drama', 6655, 14),
  ('AIsS2KrDdec', 'Sister stabbed her. Reborn, she let sister be queen, married a marquis, overthrew tyranny', 'King of SHORT DRAMA', 7004, 15),
  ('oZzOYVdz7jE', 'Trapped in a Swap Marriage With a DEVIL. My Curves Caught His Eye — He Fell HARD, Family SPOILED Me!', 'Spark ShortDrama', 5613, 16),
  ('eAOCZO3VPmc', 'He Thought I’d Beg Him To Marry Me! Reborn,I Helped Husband Take Concubines—He’s Stunned!', 'RURU Drama', 7553, 17),
  ('7cT0YeANpac', 'In her past life, her sister died while she found happiness. Reborn, she became the beloved empress', 'King of SHORT DRAMA', 4352, 18),
  ('sJjzmvkbrC0', 'Reborn, I helped mom divorce scumbag husband, marry a prince, and became the royal family''s darling!', 'Sarah Sweet Drama', 7285, 19),
  ('yp1l1sPowFM', 'On Our Wedding Day, He Chose His Mistress—So I Married a Loyal CEO Instead', 'Rose Drama', 3245, 20),
  ('i8zbEIeTTAM', 'My sister wants to steal my husband? The War God slaps her away: "She is my only Queen!"', 'Nunu Drama 🔥', 3768, 21),
  ('a2LKg-i4R9M', 'A Fairy Saved Her Before Death. She Woke Up One Year Earlier... This Time, She Fights Back!', 'StarRay Shorts', 6589, 22),
  ('c3ge5ZcTjaM', 'Her fiancé gave her to his crippled uncle. He was the real powerhouse—and she never looked back', '花火劇場', 4564, 23),
  ('Wfdk3lZz4Ow', 'The Divine Healer: Saving the Kingdom and Destroying My Enemies', 'Love Destiny', 5855, 24),
  ('4W2FUpuEzrk', 'He swapped my carriage. I married his brother. Now he cries', 'PlotCrunch', 4031, 25),
  ('O5qZfbeb_I0', 'Her fiancé left her. The man everyone feared became her greatest love', '海明劇場', 3736, 26),
  ('eZTTQuEuc4Y', '🔥Trapped inside a game as the Villainess, she refuses to follow the ending they designed for her！', 'Moonlit Melodramas', 7995, 27),
  ('EgO4HghQ0rg', '💞Swap fates with sister: she marries wolf king, sister gets deceitful prince, life turns great！', 'Cute Bliss', 3687, 28),
  ('h_XmXQECZYw', 'You starved me for your slim waist.Reborn, I eat back my life bite by bite', 'Queen''s Revenge', 3606, 29),
  ('UQjYpp7b8hw', 'She saved his life, yet he gave her poison for his lover. She faked her death and vanished', '花火劇場', 3151, 30),
  ('bjSbU3mQ4P0', 'He pretended to be face-blind, married her sister; she married the feared regent who spoiled her!', '聼風吟劇場', 3439, 31),
  ('H627OutQA-k', 'Her Fiancé Humiliated Her With a Concubine''s Dress—She Married His Legendary War Hero Brother!', '聼風吟劇場', 5529, 32),
  ('_Q09QAL_FgI', 'Sister stole her fiancé, she married a wild demon everyone mocked—until the emperor bowed to him', 'Skyrealm Drama', 7363, 33),
  ('OTkQD4OdAto', 'She stood by him for 5 years. He still chose his childhood sweetheart. She married someone else', '花火劇場', 2834, 34),
  ('U6yHzUegbM4', 'Her adopted daughter ruined her life. Reborn, she entered the palace and took the throne of Empress', '花火劇場', 4238, 35),
  ('gKscBB0AKiA', 'She raised him, but he killed her after taking the throne. Reborn, she raised her own son to rule', '長歡短劇社', 4466, 36),
  ('kKzoyzdpbNI', 'Forced to accept her fiancé’s pregnant sister-in-law, she emptied her dowry ,watched his family fall', 'King of SHORT DRAMA', 4750, 37),
  ('PsALsl6nUms', 'She Waited 7 Years for Him, He Gave Her to His Disabled Uncle, Then Spent His Life Regretting It!', '聼風吟劇場', 4522, 38),
  ('hphmMbo3xJ0', 'Her sister fled the wedding. She became the Crown Prince’s beloved wife', '長歡短劇社', 3412, 39),
  ('AecQR-0tU9w', 'She waited three years, betrayed at the wedding. A CEO dotes on her, leaving her ex in regret', '花火劇場', 3744, 40),
  ('b0QvNln6VWI', 'Betrayed by her sweetheart, she reborn and married a destined emperor', '花火劇場', 4087, 41),
  ('nRu8vLGk2RI', 'Abandoned by god in past life, she remarried a fox demon and was deeply cherished', '花火劇場', 4318, 42),
  ('9Zz5bqXMH3E', 'Betrayed in past life, she bonded with a wolf king who dotes on her humbly', '花火劇場', 2566, 43),
  ('yA5DFvaTF9U', 'Abandoned the Princess for a Singer! She divorced the scumbag, became a War Legend, he regretted it!', 'King of SHORT DRAMA', 2985, 44),
  ('r8OSIfDVRKc', 'Her Husband Framed Her With a Fake DNA Test for Mistress. After Divorce, She Found True Love and', '海明劇場', 3362, 45),
  ('ZHWggziDxbk', '【完整版】她本是受寵的公主，表妹卻搶走了她的一切將她逼入絕境含冤而死，意外重生她發現原來表妹綁定了氣運掠奪系統，她轉身反擊霸氣回歸，奪回屬於自己的一切！【气运如织，我自为针】', 'King of SHORT DRAMA', 4332, 46),
  ('5rd8eEj4woo', 'He ruined her for his half-sister. Reborn, she married the Third Prince instead', '花火劇場', 3628, 47),
  ('VJ3n0NGvPYs', 'Her Husband Returned With a Divorce Contract for His Mistress—She Stripped Him of His Title!', '聼風吟劇場', 2465, 48),
  ('Gs0cLz_WjiU', 'He never loved her until she married another man. Now he''s begging at her wedding', '花火劇場', 4458, 49),
  ('XKqiflhDznc', 'Reborn After a Wrong Marriage, She Leaves Her Ex and Finds True Love with a Doctor!', '扶搖劇場', 3465, 50),
  ('yoeXn1_ES_Y', '【Multi Sub】She could hear every lie—and she spoke their ending', 'Water drama', 6741, 51),
  ('Z3cCAT8q5x4', 'Her sister stole the scholar. She married the Regent instead, leaving her cruel ex-husband behind', '花火劇場', 6075, 52),
  ('2wrLDOeBjV4', 'Betrayed on her delivery day, she left with her child and forsaken all love', '花火劇場', 3295, 53),
  ('0W2zay_6QhA', 'She was reduced from wife to concubine. The emperor granted her freedom and married her himself', 'BerryCider Drama', 7746, 54),
  ('H32K5P2VvCs', 'She’s Tricked Into Marrying His Brother—Then Finds True Love and Leaves Her Ex Regretting Everything', '扶搖劇場', 3797, 55),
  ('vo61ESNV_Hg', 'He broke her heart. She married the general, and the prince regretted it forever', '花火劇場', 5499, 56),
  ('18J7EV_bwJs', 'He acted out a wedding scene for someone else, and she immediately remarried', '小魚撩劇', 3921, 57),
  ('fhmvs_GciLY', 'Died waiting for him; he was with his beloved.Reborn, watched chaos. He suffered', 'King of SHORT DRAMA', 5075, 58),
  ('7hAAPOxwDi4', 'Betrayed in her past life, she left him after rebirth and became a business queen', '花火劇場', 3799, 59),
  ('0SAaH0V-3yg', '[ENG SUB] He Chose Her Sister Twice — She Chose the "Dying" Man Once — She Won', 'Girl''s Heart Short Drama Hall', 5850, 60),
  ('g9cCnL9hoiw', 'Wedding day, she pretended not to know sister had swapped grooms, married cold prince, was spoiled!', 'Sarah Sweet Drama', 5163, 61),
  ('-6Cpw8OAB6o', 'The abandoned Cinderella married the grassland prince, the scumbag ex-boyfriend regretted it!', '高甜短劇社 Sweet', 2089, 62),
  ('pY1uRa1dPZ4', 'After Cinderella was reborn, she married the general who had been disliked, he doted on her rotten!', '高甜短劇社 Sweet', 4669, 63),
  ('OQkWyKbti0A', 'After being reborn, Cinderella married an official, her scumbag ex-boyfriend regretted it!', '高甜短劇社 Sweet', 5553, 64),
  ('Oxpw3SyB5jE', 'He wanted her as a concubine. She married his brother and became the future Crown Princess', '花火劇場', 3201, 65),
  ('-xOAYnHpVkE', 'Her fake debt test drove his sick mother to death. He turned to a heiress and made her pay', '花火劇場', 3745, 66),
  ('sEBOhF_5Em8', 'Prince chose her sister over her. She allied with queen, crowned the third prince and destroyed him', 'King of SHORT DRAMA', 3409, 67),
  ('oTxvhCxxoJg', 'Forced to give up her son, she broke off and found true love; he regretted it', 'King of SHORT DRAMA', 3248, 68),
  ('poRLT9xGXTw', '前世她捨命救太子，功勞卻被長姐冒領，最終毒發慘死葬身蛇窟！這一世她將計就計送嫡姐入東宮，笑看著這對狗男女反目成仇身敗名裂，而她的將軍夫君將她捧在心尖，尊享一生榮寵！', '夢歸雲劇場', 2681, 69),
  ('NQXKjAt_raY', 'Sister Stole My Fate for the Throne, Unaware Whomever I Marry Becomes the Supreme Emperor!', 'Starlight Moment', 5003, 70),
  ('9m9nLpE6dkU', 'Two Reborn Sisters Swapped Fate as Beast Girls, Conquering the Palace to Rule the Nation!', 'Starlight Moment', 6468, 71),
  ('KQmoZANivtU', '[ENG SUB]✨Reborn Heiress Refuses to Be a Concubine: Marrying the General for Epic Revenge!', 'Twilight Drama Dreams💫', 2917, 72),
  ('xFluKjYCsi8', 'They Duped Her Clan into a $10B Debt, Unaware the "Dumb" Girl Was a Legendary Lawyer!', 'Starlight Moment', 3648, 73),
  ('eZZwhvmOHtI', 'Her Clan Favored Her Sick Sister, Unaware the Reborn Daughter Was an Actress Ready for Revenge!', 'Starlight Moment', 5543, 74),
  ('wssi6vVqOco', 'His choice changed her fate. Forced to Marry a Frail Crown Prince, but he makes her the QUEEN', '聼風吟劇場', 4152, 75),
  ('z-gWGW13erM', 'I Burned My Wedding Dress to Escape My Sister’s Trap, Fled and Married My Childhood Love!', '聼風吟劇場', 3652, 76),
  ('M-zoS8ScZ2c', 'He Hated Me for her Death—Reborn, I Let Them Be Together to See How He’d Survive Without Me!', '聼風吟劇場', 3190, 77),
  ('9Rnisa3DKUI', 'She married a top scholar, but lived unloved! Reborn, she chose the man waiting for her in Jiangnan!', '長歡短劇社', 4427, 78),
  ('V66d9Is1n0U', 'They mocked her, but she taught the wolf-raised prince to speak', 'PlotCrunch', 3575, 79),
  ('x-AvWtktjcQ', 'FULL新娘婚禮前被青梅竹馬按進6層蛋糕，未婚夫冷眼旁觀！直到她再也沒有掙扎，這群人才知道自己闖下滔天大禍！', '星允視界', 4488, 80),
  ('Qwh2q4vHhB8', '【Full】My reborn sister stole my husband, so I married a poor man and got rich! 🚨💋', 'Drama-Mate', 9898, 81),
  ('da3IvfZxYuc', '【Full】S2: Sister stole my husband, so I turned my sick cowboy into a War Hero! 🚨💋', 'Drama-Mate', 9861, 82),
  ('TTVtgnvRyH8', '【Full】S3： Sister stole my useless ex, until I brought meat sauce to my General! 💔✨', 'Drama-Mate', 10252, 83),
  ('4s_BS1eEeMM', '【Full】S4： Sister stole my useless ex, so I studied divine medicine to save my husband!💔✨', 'Drama-Mate', 9359, 84),
  ('U3EMoQZO0NA', '【Full】Exiled with dual systems, my food & spatial store made us $100B! 🚨💋', 'Drama-Mate', 8143, 85),
  ('NBn3mUnmwgY', 'S2【Full】They thought we''d starve, but dual systems let us feast! 🚨💋', 'Drama-Mate', 8163, 86)
on conflict (youtube_id) do nothing;
