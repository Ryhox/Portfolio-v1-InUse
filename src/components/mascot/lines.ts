// What she says. Lowercase, dry, never impressed.

export const LINES = {
  hello: ["oh. hi.", "hey.", "you're here. cool.", "sup."],
  scrollTop: ["scroll. i'll wait.", "go on, scroll.", "it gets better down there. probably."],
  intro: ["reading time.", "lots of words.", "mhm. riveting."],
  work: ["oh look, projects.", "he made these. allegedly.", "click one. i dare you."],
  contact: ["say hi. or don't. whatever.", "the buttons are right there.", "go on. he's nice."],
  backTop: ["back again?", "round two."],
  poke1: ["hm?", "yes?", "...", "what."],
  poke2: ["can i help you?", "personal space.", "that's a finger."],
  poke3: ["you done?", "wow.", "really."],
  poke4: ["STOP.", "ok rude.", "i'm telling."],
  leave: ["i'm leaving.", "bye.", "nope. done."],
  back: ["i'm back. don't.", "...hi again.", "i forgive you. barely."],
  ear: ["not the ears.", "ears are off limits.", "hands off."],
  belly: ["rude.", "excuse me?"],
  cloud: ["careful.", "don't poke the cloud.", "she's sensitive."],
  pet: ["...fine. you may continue.", "this is acceptable.", "don't tell anyone.", "i-it's not like i like it."],
  petLike: ["...don't stop.", "hmph. ok. a little longer.", "you're not bad at this."],
  petEnd: ["ok that's enough.", "we're done here.", "that was barely adequate."],
  petEndLike: ["wait. that's it?", "...whatever. it was fine."],
  held: ["hey—", "put me down.", "wow. okay.", "i have legs, you know."],
  grabEar: ["OW. the EARS.", "not by the ears!!", "ears are not handles."],
  grabBody: ["...this is undignified.", "unhand me.", "i'm not a plushie."],
  grabFeet: ["UPSIDE DOWN?!", "the blood's going to my head.", "put me DOWN."],
  feet: ["ticklish. not that i care.", "hey. feet.", "don't."],
  heldLong: ["i have a cloud for this.", "any day now.", "still here. still annoyed."],
  shaken: ["why.", "@_@", "the room is spinning."],
  thrown: ["...", "wheee. i guess."],
  hardLand: ["ow.", "nailed it.", "i meant to do that."],
  softLand: ["thanks, cloud.", "good cloud.", "smooth."],
  softLandLike: ["...nice catch. i guess.", "i wasn't scared."],
  dropOn: ["i guess i live here now.", "nice view.", "this'll do."],
  scrollFast: ["slow down.", "whoa.", "speed limit, please."],
  fellOff: ["i'm fine.", "cloud. CLOUD."],
  yawn: ["*yawn*", "so sleepy.", "is it nap time."],
  wake: ["i was awake.", "i wasn't sleeping.", "what. who."],
  night: ["it's late.", "nap o'clock.", "the moon's out."],
  day: ["ugh. bright.", "too sunny.", "my eyes."],
  musicOn: ["ooh.", "this one's ok.", "not bad."],
  musicOff: ["aw.", "hey, i was listening."],
  dance: ["fine. one dance.", "don't look."],
  noDance: ["no.", "i don't dance."],
  select: ["reading? cute.", "highlighting. very studious.", "that part's good."],
  copy: ["ctrl+c. classic.", "plagiarism, huh.", "copy that."],
  typing: ["who are you typing to?", "typing to nobody?", "i can't read that."],
  awayBack: ["oh. you're back.", "took you long enough.", "missed you. kidding."],
  stillHere: ["you're still here?", "nice, a regular."],
  resize: ["whoa.", "stop moving the walls."],
  menu: ["no menu here.", "that's not a button."],
  hover: ["...", "hm.", "can i help you?", "you're hovering."],
  bored: ["so. bored.", "nothing ever happens.", "*sigh*"],
  stars: ["the stars are out.", "pretty. not that i care.", "make a wish or whatever."],
  sulk: ["hmph.", "not talking to you.", "i'm ignoring you. obviously."],
  scrollFlip: ["make up your mind.", "up. down. up. pick one.", "are you lost?", "it's a website, not a yo-yo."],
  seasick: ["i'm getting seasick.", "@_@ stop.", "the cloud is NOT a rollercoaster.", "my lunch is moving."],
  scrollAngry: ["OK. ENOUGH.", "one more time. i dare you.", "i will bite.", "do you want me to throw up on your site?"],
  scrollSulk: ["i'm not watching anymore.", "wake me when you've decided.", "hmph. scroll alone."],
  scrollCalm: ["...finally. stable ground.", "thank you.", "the world stopped spinning."],
  scrollLong: ["where are we going?", "keep going. i'm along for the ride.", "wheee. (sarcastically)", "are we there yet?"],
  scrollUp: ["going back?", "forgot something?", "rewind.", "wrong way, genius."],
  scrollStop: ["here? ok.", "...finally.", "nice place.", "this the spot?"],
  reading: ["reading every word, huh.", "slow and steady.", "a real reader. cute."],
  bottom: ["end of the line.", "that's it. that's the whole site.", "nothing down here. trust me.", "you made it. want a medal?"],
  allTheWayUp: ["all the way back up? dedication.", "and we're back.", "full circle. wow."],
  movingAgain: ["oh. we're moving again.", "finally, some action.", "she lives."],
  project: ["ooh. that one.", "he's proud of that one. don't tell him i said so.", "click it. you know you want to.", "that one's actually cool."],
  heldScroll: ["where are you taking me?", "scrolling AND holding me? multitasker.", "this is a kidnapping."],
};

export type LineKey = keyof typeof LINES;

const last: Partial<Record<LineKey, number>> = {};

// A line from the set, not the same one twice in a row.
export function line(key: LineKey): string {
  const list = LINES[key];
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === last[key]) i = (i + 1) % list.length;
  last[key] = i;
  return list[i];
}
