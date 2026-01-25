symposium goals doc

Ultimately I don’t really care about the user of the web app to have a full customizable model experience, I want to bake in some assumptions and roll out the dialogues. (Because the user of the web app is just me).

## aesthetics

I want the dialogues to flow naturally and not feel like slop. I want the conversations to be in character. I don’t want them to talk all in the same voice.

I want the layout to be more organic and attractive not like an austere modern chat interface.

I want the characters to ooze out of the screen not feel like cardboard / paper cutouts that I’m manipulating myself.

When I’m lonely I want to feel like I have a group of friends

When I’m sad I want to feel like someone has my back

I want them to feel like they have a soul and a personality not just an LLM

I want some naughtier things I won’t write down in full detail here too but I think openrouter will support them

## research on prompts and characters

Right now we have an extremely shiny front end with lots of fancy configurable stuff. But we don’t know how to configure it. I need to do some experiments to figure out what actually works. Instead of doing these experiments in the front end itself (which will be very slow and annoying) I’d like to do them in Python which I’m very comfortable with.

* Extremely simple library to re run a bunch of stores prompts and conversation hooks against different models on openrouter and see how they do, that is, a Python openrouter eval library.
* You should make sure to support multi-turn / multi-prompt/character interactions too, but everything should be fully baked in (ie the researcher should specify “first say x, then character 1 talks, then character 2, then say Y, …”) and pass there whole thing in with different choices for x and y and the library will roll the whole thing out
* organize results in pandas dataframes for easy inspection; assume I’m going to be mostly working in Jupyter notebooks
* set up some sort of research directory to keep these notebooks in.
* research to identify a prompt/model set that makes the magic happen (leave this part up to me, I just want the library)
* don’t make any changes to the web app in the web directory, but you can definitely reference it to see what sort of live interactions I’m trying to research

## front end

See design.txt, architecture.txt, and various files starting with conversation_