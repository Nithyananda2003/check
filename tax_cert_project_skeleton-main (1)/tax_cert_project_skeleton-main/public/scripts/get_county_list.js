
class GetCountyList{
	constructor(stateDiv, countyDiv){
		this.stateDiv = stateDiv;
		this.countyDiv = countyDiv;
		this.loadindDiv = document.querySelector(".loading-modal");

		this.url = "/misc/county";
		this.data = {};

		this.addChangeEvent();
	}
	addChangeEvent(){
		this.stateDiv.addEventListener('change', async (e) => {
			this.reset();
			this.loading();
			this.data = {};
			try{
				const state = this.stateDiv.value;			
				const response = await fetch(`/misc/county?state=${state}`);
				const result = await response.json();

				this.loading_hide();
				if(result.error){
					this.createCountyList([]);
					return;
				}
				this.data = result.data;
				this.createCountyList(result.data);
			}
			catch(error){
				console.log(error.message);
				this.createCountyList([]);
			}
		});
	}
	createCountyList(data){
		if(data.length > 0){
			data.forEach((county, i)=>{
				const option = document.createElement('option');
				option.value = county['path'];
				option.textContent = county['county'];
				this.countyDiv.append(option)
			})
		}
		else{
			this.countyDiv.innerHTML = '<option selected value="">Choose...</option>';
		}
	}
	reset(){
		this.createCountyList([]);
	}
	loading(){
		this.loadindDiv.classList.remove('loading-modal-hide');
	}
	loading_hide(){
		this.loadindDiv.classList.add('loading-modal-hide');
	}
}

const state_div = document.getElementById('stateSelect');
const county_div = document.getElementById('countySelect');
new GetCountyList(state_div, county_div);